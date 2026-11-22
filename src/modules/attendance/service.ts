import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { createSecurity, Scope } from "@/server/security/service";
import { can } from "@/server/security/permissions";
import { BusinessError } from "@/server/errors";
import { audit } from "@/server/audit";
import { parse, readMember } from "@/modules/members/service";
import { calendarDate } from "@/modules/memberships/schemas";
import { daysBetween } from "@/modules/memberships/state";
import {
  accessMember,
  memberAccess,
  memberAccessMany,
  attendanceOrganization,
} from "./access";
import type { AccessMember } from "./access";
import type { AttendanceData, AttendanceResult, Visit } from "./types";
const selection = {
  organizationId: z.uuid().optional(),
  branchId: z.uuid().optional(),
};
const listInput = z
  .object({
    ...selection,
    view: z.enum(["today", "inside", "history"]).default("today"),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    fromOn: calendarDate.optional(),
    throughOn: calendarDate.optional(),
  })
  .strict();
const lookupInput = z
  .object({
    organizationId: z.uuid(),
    branchId: z.uuid(),
    q: z.string().trim().min(1).max(120),
  })
  .strict();
const mutationInput = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("check_in"),
      organizationId: z.uuid(),
      branchId: z.uuid(),
      memberId: z.uuid(),
      requestKey: z.uuid(),
      overrideReason: z
        .string()
        .trim()
        .max(300)
        .refine((v) => !/[\u0000-\u001f\u007f]/.test(v))
        .default(""),
    })
    .strict(),
  z
    .object({
      operation: z.literal("check_out"),
      organizationId: z.uuid(),
      branchId: z.uuid(),
      visitId: z.uuid(),
      requestKey: z.uuid(),
    })
    .strict(),
]);
const visitFields = `v.id,v.member_id as "memberId",m.name as "memberName",m.member_code as "memberCode",v.branch_id as "branchId",b.name as "branchName",to_jsonb(v.checked_in_at)#>>'{}' as "checkedInAt",to_jsonb(v.checked_out_at)#>>'{}' as "checkedOutAt",case when v.checked_out_at is null then null else extract(epoch from(v.checked_out_at-v.checked_in_at))::int end as "durationSeconds",v.checked_out_at is null and (v.checked_in_at at time zone $3)::date<$4::date as stale,v.override_reason as "overrideReason"`;
export async function memberVisits(db: PoolClient, scope: Scope, id: string) {
  const org = await attendanceOrganization(db, scope);
  const rows = await db.query<Visit>(
    `select ${visitFields} from gym.attendance_visits v join gym.members m on m.organization_id=v.organization_id and m.id=v.member_id join gym.branches b on b.organization_id=v.organization_id and b.id=v.branch_id where v.organization_id=$1 and v.member_id=$2 and v.branch_id=any($5::uuid[]) order by v.checked_in_at desc,v.id desc limit 20`,
    [scope.organizationId, id, org.timeZone, org.today, [...scope.branchIds]],
  );
  const total = (
    await db.query(
      "select count(*)::int n from gym.attendance_visits where organization_id=$1 and member_id=$2 and branch_id=any($3::uuid[])",
      [scope.organizationId, id, [...scope.branchIds]],
    )
  ).rows[0].n;
  return { rows: rows.rows, total };
}
export function createAttendanceService(
  security: ReturnType<typeof createSecurity>,
) {
  async function get(headers: Headers, raw: unknown): Promise<AttendanceData> {
    const q = parse(listInput, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId, branchId: q.branchId },
      "attendance.manage",
      async (db, scope) => {
        const org = await attendanceOrganization(db, scope),
          branchId = q.branchId ?? scope.branchIds[0];
        const fromOn = q.view === "today" ? org.today : (q.fromOn ?? org.today),
          throughOn =
            q.view === "today" ? org.today : (q.throughOn ?? org.today);
        if (fromOn > throughOn || daysBetween(fromOn, throughOn) > 366)
          throw new BusinessError(
            "VALIDATION_ERROR",
            "Choose a valid attendance range of at most one year.",
          );
        const branches = (
          await db.query<{ id: string; name: string }>(
            "select id,name from gym.branches where organization_id=$1 and id=any($2::uuid[]) order by name,id",
            [scope.organizationId, [...scope.authorizedBranchIds]],
          )
        ).rows;
        const filter =
          q.view === "inside"
            ? "v.checked_out_at is null"
            : "v.checked_in_at>=($5::date::timestamp at time zone $3) and v.checked_in_at<(($6::date+1)::timestamp at time zone $3)";
        const args = [
          scope.organizationId,
          branchId,
          org.timeZone,
          org.today,
          fromOn,
          throughOn,
        ];
        // Keep all placeholders bound in the open-visit view as well.
        const scoped = `v.organization_id=$1 and v.branch_id=$2 and $3::text is not null and $4::date is not null and $5::date is not null and $6::date is not null and (${filter})`;
        const total = (
          await db.query(
            `select count(*)::int n from gym.attendance_visits v where ${scoped}`,
            args,
          )
        ).rows[0].n;
        const page = Math.max(1, Math.min(q.page, Math.ceil(total / 25) || 1));
        const visits = (
          await db.query<Visit>(
            `select ${visitFields} from gym.attendance_visits v join gym.members m on m.organization_id=v.organization_id and m.id=v.member_id join gym.branches b on b.organization_id=v.organization_id and b.id=v.branch_id where ${scoped} order by v.checked_in_at desc,v.id desc limit 25 offset $7`,
            [...args, (page - 1) * 25],
          )
        ).rows;
        const summary = (
          await db.query(
            `select (select count(*)::int from gym.attendance_visits v where v.organization_id=$1 and v.branch_id=$2 and (v.checked_in_at at time zone $3)::date=$4::date) as "checkIns",count(*) filter(where v.checked_out_at is null)::int inside,count(*) filter(where v.checked_out_at is not null and (v.checked_in_at at time zone $3)::date=$4::date)::int closed,round(avg(extract(epoch from(v.checked_out_at-v.checked_in_at))) filter(where v.checked_out_at is not null and (v.checked_in_at at time zone $3)::date=$4::date))::int as "averageSeconds",count(*) filter(where v.checked_out_at is null and (v.checked_in_at at time zone $3)::date<$4::date)::int stale from gym.attendance_visits v where v.organization_id=$1 and v.branch_id=$2`,
            args.slice(0, 4),
          )
        ).rows[0];
        return {
          organization: {
            id: org.id,
            name: org.name,
            locale: org.locale,
            timeZone: org.timeZone,
          },
          branches,
          branchId,
          today: org.today,
          view: q.view,
          fromOn,
          throughOn,
          page,
          total,
          visits,
          summary,
          canManageSettings: can(scope.role, "settings.read"),
          canManageMembers: can(scope.role, "members.manage"),
          canReadPlans: can(scope.role, "plans.read"),
          canReadBilling: can(scope.role, "billing.read"),
          requestId: scope.requestId,
        };
      },
    );
  }
  async function lookup(headers: Headers, raw: unknown) {
    const q = parse(lookupInput, raw);
    return security.run(
      headers,
      qSelection(q),
      "attendance.manage",
      async (db, scope) => {
        const code = q.q.replace(/^MOJYM:/i, "");
        const token = z.uuid().safeParse(code);
        const term = "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%";
        const digits = q.q.replace(/\D/g, "");
        const exactMemberCode = /^M-\d+$/i.test(q.q);
        const ids = (
          await db.query<AccessMember>(
            `select m.id,m.name,m.member_code as "memberCode",m.home_branch_id as "homeBranchId",m.archived_at is not null archived,right(m.normalized_phone,4) as "phoneEnding" from gym.members m left join gym.member_access_tokens t on t.organization_id=m.organization_id and t.member_id=m.id where m.organization_id=$1 and (case when $4::uuid is not null then t.token=$4 when $7::boolean then upper(m.member_code)=upper($8::text) else (m.member_code ilike $2 or m.name ilike $2 or ($3::text<>'' and m.normalized_phone like '%'||$3||'%')) end) and (m.home_branch_id=any($5::uuid[]) or exists(select 1 from gym.attendance_visits v where v.organization_id=m.organization_id and v.member_id=m.id and v.branch_id=$6 and v.checked_out_at is null) or exists(select 1 from gym.memberships p join gym.organizations o on o.id=p.organization_id where p.organization_id=m.organization_id and p.member_id=m.id and p.snapshot->>'accessMode'='all_branches' and p.start_on<=(clock_timestamp() at time zone o.time_zone)::date and p.end_on_exclusive+o.grace_days>(clock_timestamp() at time zone o.time_zone)::date and (p.cancelled_effective_on is null or p.cancelled_effective_on>(clock_timestamp() at time zone o.time_zone)::date))) order by m.name,m.id limit 20`,
            [
              scope.organizationId,
              term,
              digits.length >= 3 ? digits : "",
              token.success ? token.data : null,
              [...scope.authorizedBranchIds],
              q.branchId,
              exactMemberCode,
              q.q,
            ],
          )
        ).rows;
        const candidates = await memberAccessMany(db, scope, ids, q.branchId);
        return {
          candidates,
          exactCode: token.success || exactMemberCode,
          requestId: scope.requestId,
        };
      },
    );
  }
  async function record(headers: Headers, raw: unknown) {
    const v = parse(mutationInput, raw);
    return security.run(
      headers,
      qSelection(v),
      "attendance.manage",
      async (db, scope) => {
        await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          "attendance:" +
            scope.organizationId +
            ":" +
            scope.userId +
            ":" +
            v.requestKey,
        ]);
        const hash = createHash("sha256")
          .update(JSON.stringify(v))
          .digest("hex");
        const prior = (
          await db.query(
            "select request_hash,branch_id,result from gym.attendance_requests where organization_id=$1 and actor_id=$2 and request_key=$3",
            [scope.organizationId, scope.userId, v.requestKey],
          )
        ).rows[0];
        if (prior) {
          if (prior.request_hash !== hash)
            throw new BusinessError(
              "CONFLICT",
              "This attendance request was already used with different values.",
            );
          if (!scope.branchIds.includes(prior.branch_id))
            throw new BusinessError(
              "NOT_FOUND",
              "Attendance request unavailable.",
            );
          return {
            ...prior.result,
            requestId: scope.requestId,
          } as AttendanceResult;
        }
        let result: Omit<AttendanceResult, "requestId">;
        if (v.operation === "check_in") {
          const member = await accessMember(
            db,
            scope,
            v.memberId,
            v.branchId,
            true,
          );
          const candidate = await memberAccess(db, scope, member, v.branchId);
          if (member.archived)
            throw new BusinessError(
              "ACCESS_DENIED",
              "Archived members cannot check in.",
              { reason: "archived" },
            );
          if (candidate.openVisitId)
            result = {
              visitId: candidate.openVisitId,
              memberId: member.id,
              state: "already_inside",
              foreignOpen: !candidate.openInBranch,
            };
          else {
            const override =
              !candidate.access.allowed &&
              candidate.canOverride &&
              v.overrideReason.length >= 3;
            if (!candidate.access.allowed && !override)
              throw new BusinessError(
                "ACCESS_DENIED",
                "Access is blocked: " +
                  candidate.access.reason.replaceAll("_", " ") +
                  ".",
                {
                  reason: candidate.access.reason,
                  canOverride: candidate.canOverride,
                },
              );
            if (v.overrideReason && !candidate.canOverride)
              throw new BusinessError(
                "FORBIDDEN",
                "You cannot approve an access override.",
              );
            const visit = (
              await db.query(
                "insert into gym.attendance_visits(organization_id,member_id,branch_id,membership_id,checked_in_by,eligibility_snapshot,override_actor_id,override_reason) values($1,$2,$3,$4,$5,$6::jsonb,$7,$8) returning id,to_jsonb(checked_in_at)#>>'{}' as entered",
                [
                  scope.organizationId,
                  member.id,
                  v.branchId,
                  candidate.membershipId,
                  scope.userId,
                  JSON.stringify(candidate.access),
                  override ? scope.userId : null,
                  override ? v.overrideReason : "",
                ],
              )
            ).rows[0];
            await db.query(
              "update gym.members set version=version+1,updated_at=clock_timestamp(),updated_by=$3 where organization_id=$1 and id=$2",
              [scope.organizationId, member.id, scope.userId],
            );
            await audit(
              db,
              scope,
              "attendance.checked_in",
              visit.id,
              override ? v.overrideReason : "Member checked in",
              null,
              {
                memberId: member.id,
                branchId: v.branchId,
                checkedInAt: visit.entered,
                accessReason: candidate.access.reason,
                overridden: override,
              },
            );
            result = {
              visitId: visit.id,
              memberId: member.id,
              state: "checked_in",
              foreignOpen: false,
            };
          }
        } else {
          const ref = (
            await db.query(
              "select member_id from gym.attendance_visits where organization_id=$1 and id=$2 and branch_id=$3",
              [scope.organizationId, v.visitId, v.branchId],
            )
          ).rows[0];
          if (!ref)
            throw new BusinessError(
              "NOT_FOUND",
              "Visit not found in this branch.",
            );
          await db.query(
            "select id from gym.members where organization_id=$1 and id=$2 for update",
            [scope.organizationId, ref.member_id],
          );
          const visit = (
            await db.query(
              "select checked_out_at from gym.attendance_visits where organization_id=$1 and id=$2 and branch_id=$3 for update",
              [scope.organizationId, v.visitId, v.branchId],
            )
          ).rows[0];
          if (!visit.checked_out_at) {
            const saved = (
              await db.query(
                "update gym.attendance_visits set checked_out_at=clock_timestamp(),checked_out_by=$3 where organization_id=$1 and id=$2 returning to_jsonb(checked_out_at)#>>'{}' as exited",
                [scope.organizationId, v.visitId, scope.userId],
              )
            ).rows[0];
            await db.query(
              "update gym.members set version=version+1,updated_at=clock_timestamp(),updated_by=$3 where organization_id=$1 and id=$2",
              [scope.organizationId, ref.member_id, scope.userId],
            );
            await audit(
              db,
              scope,
              "attendance.checked_out",
              v.visitId,
              "Member checked out",
              null,
              {
                memberId: ref.member_id,
                branchId: v.branchId,
                checkedOutAt: saved.exited,
              },
            );
          }
          result = {
            visitId: v.visitId,
            memberId: ref.member_id,
            state: "checked_out",
            foreignOpen: false,
          };
        }
        await db.query(
          "insert into gym.attendance_requests(organization_id,actor_id,request_key,request_hash,operation,branch_id,member_id,visit_id,result) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
          [
            scope.organizationId,
            scope.userId,
            v.requestKey,
            hash,
            v.operation,
            v.branchId,
            result.memberId,
            result.visitId,
            JSON.stringify(result),
          ],
        );
        return { ...result, requestId: scope.requestId };
      },
    );
  }
  async function code(headers: Headers, raw: unknown) {
    const v = parse(
      z.object({ organizationId: z.uuid(), memberId: z.uuid() }).strict(),
      raw,
    );
    return security.run(
      headers,
      { organizationId: v.organizationId },
      "members.manage",
      async (db, scope) => {
        const member = await readMember(db, scope, v.memberId, "share", true);
        const created = await db.query(
          "insert into gym.member_access_tokens(organization_id,member_id,created_by) values($1,$2,$3) on conflict(organization_id,member_id) do nothing returning token",
          [scope.organizationId, member.id, scope.userId],
        );
        const row =
          created.rows[0] ??
          (
            await db.query(
              "select token from gym.member_access_tokens where organization_id=$1 and member_id=$2",
              [scope.organizationId, member.id],
            )
          ).rows[0];
        if (created.rowCount)
          await audit(
            db,
            scope,
            "member.access_code_created",
            member.id,
            "Member lookup card created",
            null,
            { memberId: member.id },
          );
        return {
          memberCode: member.memberCode,
          name: member.name,
          payload: "MOJYM:" + row.token,
          requestId: scope.requestId,
        };
      },
    );
  }
  return { get, lookup, record, code };
}
function qSelection(v: { organizationId: string; branchId: string }) {
  return { organizationId: v.organizationId, branchId: v.branchId };
}
