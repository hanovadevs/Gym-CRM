import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { createSecurity, Scope } from "@/server/security/service";
import { BusinessError } from "@/server/errors";
import { audit } from "@/server/audit";
import { can } from "@/server/security/permissions";
import { parse, readMember } from "@/modules/members/service";
import type { Member } from "@/modules/members/types";
import { resolvePlanSnapshot } from "@/modules/plans/service";
import { endOn, previousDay, todayInZone } from "@/modules/plans/format";
import {
  querySchema,
  enrollmentFields,
  enrollmentSchema,
  lifecycleSchema,
} from "./schemas";
import { daysBetween, effectiveEnd, status, eligibility } from "./state";
import type { Membership, MembershipContext, EnrollmentPreview } from "./types";
function calculateEnd(start: string, count: number, unit: "months" | "days") {
  try {
    return endOn(start, count, unit);
  } catch {
    throw new BusinessError(
      "VALIDATION_ERROR",
      "The requested term ends outside supported calendar dates.",
    );
  }
}
const json = `jsonb_build_object('id',m.id,'homeBranchId',m.home_branch_id,'planVersionId',m.plan_version_id,'snapshot',m.snapshot,'amountMinor',m.amount_minor,'currency',m.currency,'startOn',m.start_on,'originalEndOn',m.original_end_on_exclusive,'endOn',m.end_on_exclusive,'lifecycle',m.lifecycle,'activatedAt',m.activated_at,'cancelledEffectiveOn',m.cancelled_effective_on,'version',m.version,'invoice',jsonb_build_object('id',i.id,'number',i.number,'totalMinor',i.total_minor,'currency',i.currency,'issuedOn',i.issued_on,'dueOn',i.due_on),'freezes',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'startOn',f.start_on,'endOn',f.end_on_exclusive,'extensionDays',f.extension_days,'reason',f.reason,'reversedAt',f.reversed_at) order by f.start_on,f.id) from gym.membership_freezes f where f.organization_id=m.organization_id and f.membership_id=m.id),'[]'::jsonb))`;
const join =
  "gym.memberships m join gym.invoices i on i.organization_id=m.organization_id and i.membership_id=m.id";
const where =
  "m.organization_id=$1 and m.member_id=$2 and m.home_branch_id=any($3::uuid[])";
const bindings = (s: Scope, id: string) => [
  s.organizationId,
  id,
  [...s.branchIds],
];
async function orgValues(db: PoolClient, s: Scope) {
  return (
    await db.query(
      'select currency,locale,time_zone as "timeZone",paid_activation as "paidActivation",debt_blocks_access as "debtBlocksAccess",grace_days as "graceDays",receipt_prefix as "receiptPrefix" from gym.organizations where id=$1 for share',
      [s.organizationId],
    )
  ).rows[0];
}
async function summary(db: PoolClient, s: Scope, id: string) {
  return (
    await db.query(
      `select count(*)::int total,coalesce(max(case when greatest(start_on,least(end_on_exclusive,coalesce(cancelled_effective_on,end_on_exclusive)))>start_on then least(end_on_exclusive,coalesce(cancelled_effective_on,end_on_exclusive)) end)::text,'') tail from gym.memberships where organization_id=$1 and member_id=$2`,
      [s.organizationId, id],
    )
  ).rows[0];
}
export async function readMembershipContext(
  db: PoolClient,
  s: Scope,
  member: Member,
  page = 1,
  planQuery = "",
): Promise<MembershipContext> {
  const org = await orgValues(db, s),
    today = todayInZone(org.timeZone),
    all = await summary(db, s, member.id);
  const result = (
    await db.query(
      `with tally as(select count(*)::int total from gym.memberships m where ${where}), bounds as(select total,greatest(1,least($4::int,(total+19)/20)) page from tally) select total,page,coalesce((select jsonb_agg(r.value) from(select ${json} as value from ${join} where ${where} order by m.start_on desc,m.created_at desc,m.id limit 20 offset(select(page-1)*20 from bounds)) r),'[]'::jsonb) rows from bounds`,
      [...bindings(s, member.id), page],
    )
  ).rows[0];
  const candidates = (
    await db.query(
      `select ${json} as value from ${join} where ${where} and (m.end_on_exclusive+$5::int>$4::date or m.cancelled_effective_on is not null) order by case when m.start_on<=$4::date and least(m.end_on_exclusive+$5::int,coalesce(m.cancelled_effective_on,m.end_on_exclusive+$5::int))>$4::date then case when m.activated_at is not null then 0 else 1 end else 2 end,m.start_on desc limit 4`,
      [...bindings(s, member.id), today, org.graceDays],
    )
  ).rows.map((r) => r.value as Membership);
  if (!candidates.length && result.rows.length) candidates.push(result.rows[0]);
  const due = (
    await db.query(
      `select exists(select 1 from gym.invoices i join gym.invoice_balances b on b.organization_id=i.organization_id and b.invoice_id=i.id where i.organization_id=$1 and i.member_id=$2 and i.due_on<=$3::date and b.balance_minor>0) due`,
      [s.organizationId, member.id, today],
    )
  ).rows[0].due;
  const access = eligibility(
    candidates,
    today,
    !!member.archivedAt,
    org.graceDays,
    false,
  );
  if (access.allowed && org.debtBlocksAccess && due) {
    access.allowed = false;
    access.reason = "debt_blocked";
  }
  const choices = (
    await db.query(
      `with choices as(select v.id,v.name,v.amount_minor as "amountMinor",v.currency,v.duration_unit as "durationUnit",v.duration_count as "durationCount" from gym.plans p join lateral(select * from gym.plan_versions where organization_id=p.organization_id and plan_id=p.id order by version desc limit 1)v on true where p.organization_id=$1 and p.branch_id=$2 and p.archived_at is null and v.currency=$3 and (v.name ilike $4 or p.code ilike $4)) select (select count(*)::int from choices) total,coalesce((select jsonb_agg(c) from(select * from choices order by name,id limit 100)c),'[]'::jsonb) plans`,
      [
        s.organizationId,
        member.homeBranchId,
        org.currency,
        "%" + planQuery.replace(/[\\%_]/g, "\\$&") + "%",
      ],
    )
  ).rows[0];
  return {
    memberId: member.id,
    memberVersion: member.version,
    archived: !!member.archivedAt,
    organizationId: s.organizationId,
    ...org,
    today,
    canOverride: can(s.role, "memberships.override"),
    memberships: result.rows.map((m: Membership) => ({
      ...m,
      status: status(m, today),
    })),
    total: result.total,
    page: result.page,
    pageSize: 20,
    hasHistory: all.total > 0,
    nextStartOn: all.tail > today ? all.tail : today,
    plans: choices.plans,
    planCount: choices.total,
    eligibility: access,
    requestId: s.requestId,
  };
}
async function overlap(
  db: PoolClient,
  s: Scope,
  memberId: string,
  start: string,
  end: string,
  exclude?: string,
) {
  const r = await db.query(
    `select id from gym.memberships where organization_id=$1 and member_id=$2 and ($5::uuid is null or id<>$5) and daterange(start_on,greatest(start_on,least(end_on_exclusive,coalesce(cancelled_effective_on,end_on_exclusive))),'[)') && daterange($3::date,$4::date,'[)') limit 1`,
    [s.organizationId, memberId, start, end, exclude ?? null],
  );
  if (r.rowCount)
    throw new BusinessError(
      "CONFLICT",
      "This period overlaps an existing membership or future renewal. Review the existing periods first.",
    );
}
async function enrollmentPreview(
  db: PoolClient,
  s: Scope,
  member: Member,
  input: z.infer<typeof enrollmentFields>,
): Promise<EnrollmentPreview> {
  if (member.archivedAt)
    throw new BusinessError(
      "CONFLICT",
      "Restore this member before enrolling or renewing.",
    );
  if (member.version !== input.memberVersion)
    throw new BusinessError(
      "CONFLICT",
      "This member changed. Reload latest before confirming.",
    );
  const org = await orgValues(db, s),
    today = todayInZone(org.timeZone),
    all = await summary(db, s, member.id);
  if (
    (input.mode === "enroll" && all.total > 0) ||
    (input.mode === "renew" && all.total === 0)
  )
    throw new BusinessError(
      "CONFLICT",
      "Membership history changed. Reload and choose the current enrollment action.",
    );
  const plan = await resolvePlanSnapshot(db, s, input.planVersionId);
  if (plan.branchId !== member.homeBranchId)
    throw new BusinessError(
      "NOT_FOUND",
      "Choose a plan in the member’s home branch.",
    );
  const start =
    input.startOn ??
    (input.mode === "renew" && all.tail > today ? all.tail : today);
  if (start < today || start < member.joinedOn)
    throw new BusinessError(
      "VALIDATION_ERROR",
      "Memberships must start today or later, after the joining date.",
    );
  const end = calculateEnd(start, plan.durationCount, plan.durationUnit);
  await overlap(db, s, member.id, start, end);
  return {
    memberVersion: member.version,
    plan,
    startOn: start,
    endOn: end,
    lastAccessOn: previousDay(end),
    activation:
      org.paidActivation && plan.amountMinor > 0 ? "pending" : "active",
    reason:
      org.paidActivation && plan.amountMinor > 0
        ? "Payment is required before activation. An owner or manager can explicitly activate with debt."
        : "The configured policy permits activation. An issued charge remains separate from payment.",
    requestId: s.requestId,
  };
}
export function createMembershipsService(
  security: ReturnType<typeof createSecurity>,
) {
  async function get(headers: Headers, id: string, raw: unknown) {
    parse(z.uuid(), id);
    const q = parse(querySchema, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId },
      "memberships.manage",
      async (db, s) =>
        readMembershipContext(
          db,
          s,
          await readMember(db, s, id, "share", true),
          q.page,
          q.planQuery,
        ),
    );
  }
  async function preview(headers: Headers, id: string, raw: unknown) {
    parse(z.uuid(), id);
    const input = parse(enrollmentFields, raw);
    return security.run(
      headers,
      { organizationId: input.organizationId },
      "memberships.manage",
      async (db, s) =>
        enrollmentPreview(
          db,
          s,
          await readMember(db, s, id, "share", true),
          input,
        ),
    );
  }
  async function mutate(
    headers: Headers,
    id: string,
    raw: unknown,
    enrolling: boolean,
  ) {
    parse(z.uuid(), id);
    const input = enrolling
        ? parse(enrollmentSchema, raw)
        : parse(lifecycleSchema, raw),
      operation = "mode" in input ? input.mode : input.operation;
    return security.run(
      headers,
      { organizationId: input.organizationId },
      enrolling ? "memberships.manage" : "memberships.override",
      async (db, s) => {
        await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          "membership-request:" +
            s.organizationId +
            ":" +
            s.userId +
            ":" +
            input.requestKey,
        ]);
        const member = await readMember(db, s, id, true, true),
          hash = createHash("sha256")
            .update(JSON.stringify({ id, ...input }))
            .digest("hex");
        const old = (
          await db.query(
            "select member_id,request_hash,result from gym.membership_requests where organization_id=$1 and actor_id=$2 and operation=$3 and request_key=$4",
            [s.organizationId, s.userId, operation, input.requestKey],
          )
        ).rows[0];
        if (old) {
          if (old.member_id !== id || old.request_hash !== hash)
            throw new BusinessError(
              "CONFLICT",
              "This request key belongs to different details. Reload latest before starting another change.",
            );
          return { ...old.result, replayed: true, requestId: s.requestId };
        }
        if (member.version !== input.memberVersion)
          throw new BusinessError(
            "CONFLICT",
            "This member changed. Your inputs are kept; reload latest before confirming.",
          );
        let result: Record<string, unknown>;
        if ("mode" in input) {
          const p = await enrollmentPreview(db, s, member, input),
            org = await orgValues(db, s);
          const m = (
            await db.query(
              `insert into gym.memberships(organization_id,member_id,home_branch_id,plan_version_id,snapshot,amount_minor,currency,start_on,original_end_on_exclusive,end_on_exclusive,lifecycle,activated_at,created_by) values($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$9,$10,case when $10='active' then now() else null end,$11) returning id`,
              [
                s.organizationId,
                id,
                member.homeBranchId,
                p.plan.planVersionId,
                JSON.stringify(p.plan),
                p.plan.amountMinor,
                p.plan.currency,
                p.startOn,
                p.endOn,
                p.activation,
                s.userId,
              ],
            )
          ).rows[0];
          const n = (
            await db.query(
              "insert into gym.number_counters(organization_id,kind,value) values($1,'invoice',1) on conflict(organization_id,kind) do update set value=gym.number_counters.value+1 returning value::text",
              [s.organizationId],
            )
          ).rows[0].value;
          const invoice = (
            await db.query(
              `insert into gym.invoices(organization_id,membership_id,member_id,originating_branch_id,number,description,total_minor,currency,issued_on,due_on,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id,number`,
              [
                s.organizationId,
                m.id,
                id,
                member.homeBranchId,
                org.receiptPrefix + "-INV-" + n.padStart(6, "0"),
                p.plan.name,
                p.plan.amountMinor,
                p.plan.currency,
                todayInZone(org.timeZone),
                p.startOn,
                s.userId,
              ],
            )
          ).rows[0];
          result = {
            membershipId: m.id,
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
          };
          await audit(
            db,
            s,
            "membership." + operation,
            m.id,
            input.reason,
            null,
            {
              memberId: id,
              planVersionId: p.plan.planVersionId,
              startOn: p.startOn,
              endOn: p.endOn,
              amountMinor: p.plan.amountMinor,
              currency: p.plan.currency,
              invoiceId: invoice.id,
              activation: p.activation,
            },
          );
        } else {
          const org = await orgValues(db, s),
            today = todayInZone(org.timeZone);
          const m = (
            await db.query(
              `select ${json} value from ${join} where ${where} and m.id=$4`,
              [...bindings(s, id), input.membershipId],
            )
          ).rows[0]?.value as Membership | undefined;
          if (!m) throw new BusinessError("NOT_FOUND", "Membership not found.");
          if (m.version !== input.version)
            throw new BusinessError(
              "CONFLICT",
              "This membership changed. Reload latest before confirming.",
            );
          if (member.archivedAt && input.operation !== "cancel")
            throw new BusinessError(
              "CONFLICT",
              "Restore this member before changing membership access.",
            );
          result = { membershipId: m.id };
          if (input.operation === "activate") {
            if (
              m.lifecycle !== "pending" ||
              m.activatedAt ||
              effectiveEnd(m) <= today
            )
              throw new BusinessError(
                "CONFLICT",
                "Only an unexpired pending membership can be activated.",
              );
            await db.query(
              "update gym.memberships set lifecycle='active',activated_at=now(),version=version+1 where organization_id=$1 and id=$2",
              [s.organizationId, m.id],
            );
          } else if (input.operation === "cancel") {
            if (m.cancelledEffectiveOn)
              throw new BusinessError(
                "CONFLICT",
                "Cancellation is already recorded.",
              );
            if (
              input.effectiveOn < today ||
              input.effectiveOn > m.endOn ||
              m.endOn <= today
            )
              throw new BusinessError(
                "VALIDATION_ERROR",
                "Choose a cancellation date from today through the membership end.",
              );
            await db.query(
              "update gym.memberships set lifecycle='cancelled',cancelled_effective_on=$3,version=version+1 where organization_id=$1 and id=$2",
              [s.organizationId, m.id, input.effectiveOn],
            );
          } else if (input.operation === "freeze") {
            if (m.lifecycle !== "active" || !m.activatedAt)
              throw new BusinessError(
                "CONFLICT",
                "Only an active membership can be frozen.",
              );
            const days = daysBetween(input.startOn, input.endOn);
            if (
              input.startOn < today ||
              input.startOn < m.startOn ||
              input.endOn > m.endOn ||
              days < 1 ||
              days > 3650
            )
              throw new BusinessError(
                "VALIDATION_ERROR",
                "Choose a prospective freeze inside this membership, with an exclusive end after the start.",
              );
            if (
              m.freezes.some(
                (f) =>
                  !f.reversedAt &&
                  f.startOn < input.endOn &&
                  input.startOn < f.endOn,
              )
            )
              throw new BusinessError(
                "CONFLICT",
                "This freeze overlaps an existing freeze.",
              );
            const end = calculateEnd(m.endOn, days, "days");
            await overlap(db, s, id, m.startOn, end, m.id);
            const f = (
              await db.query(
                "insert into gym.membership_freezes(organization_id,membership_id,start_on,end_on_exclusive,extension_days,reason,created_by) values($1,$2,$3,$4,$5,$6,$7) returning id",
                [
                  s.organizationId,
                  m.id,
                  input.startOn,
                  input.endOn,
                  days,
                  input.reason,
                  s.userId,
                ],
              )
            ).rows[0];
            await db.query(
              "update gym.memberships set end_on_exclusive=$3,version=version+1 where organization_id=$1 and id=$2",
              [s.organizationId, m.id, end],
            );
            result.freezeId = f.id;
          } else {
            const f = m.freezes.find(
              (f) => f.id === input.freezeId && !f.reversedAt,
            );
            if (!f)
              throw new BusinessError("NOT_FOUND", "Active freeze not found.");
            if (f.startOn < today)
              throw new BusinessError(
                "CONFLICT",
                "A freeze that has already started in the past cannot be reversed.",
              );
            const d = new Date(m.endOn + "T00:00:00Z");
            d.setUTCDate(d.getUTCDate() - f.extensionDays);
            const end = d.toISOString().slice(0, 10);
            if (
              end < m.originalEndOn ||
              (m.cancelledEffectiveOn !== null &&
                m.cancelledEffectiveOn > end) ||
              m.freezes.some(
                (x) => x.id !== f.id && !x.reversedAt && x.endOn > end,
              )
            )
              throw new BusinessError(
                "CONFLICT",
                "Reversal would invalidate another freeze.",
              );
            await overlap(
              db,
              s,
              id,
              m.startOn,
              effectiveEnd({ ...m, endOn: end }),
              m.id,
            );
            await db.query(
              "update gym.membership_freezes set reversed_at=now(),reversed_by=$3 where organization_id=$1 and id=$2",
              [s.organizationId, f.id, s.userId],
            );
            await db.query(
              "update gym.memberships set end_on_exclusive=$3,version=version+1 where organization_id=$1 and id=$2",
              [s.organizationId, m.id, end],
            );
            result.freezeId = f.id;
          }
          await audit(
            db,
            s,
            "membership." + input.operation,
            m.id,
            input.reason,
            { version: m.version, endOn: m.endOn, lifecycle: m.lifecycle },
            {
              ...result,
              version: m.version + 1,
              ...("effectiveOn" in input
                ? { effectiveOn: input.effectiveOn }
                : {}),
              ...("startOn" in input
                ? { startOn: input.startOn, endOn: input.endOn }
                : {}),
              invoiceUnchanged: true,
            },
          );
        }
        await db.query(
          "update gym.members set version=version+1,updated_by=$3,updated_at=now() where organization_id=$1 and id=$2",
          [s.organizationId, id, s.userId],
        );
        await db.query(
          "insert into gym.membership_requests(organization_id,member_id,actor_id,operation,request_key,request_hash,result) values($1,$2,$3,$4,$5,$6,$7::jsonb)",
          [
            s.organizationId,
            id,
            s.userId,
            operation,
            input.requestKey,
            hash,
            JSON.stringify(result),
          ],
        );
        return { ...result, replayed: false, requestId: s.requestId };
      },
    );
  }
  return {
    get,
    preview,
    enroll: (h: Headers, id: string, r: unknown) => mutate(h, id, r, true),
    change: (h: Headers, id: string, r: unknown) => mutate(h, id, r, false),
  };
}
