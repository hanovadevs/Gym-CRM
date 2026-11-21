import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { createSecurity, Scope } from "@/server/security/service";
import { can } from "@/server/security/permissions";
import { BusinessError } from "@/server/errors";
import { audit } from "@/server/audit";
import {
  createPlan,
  publishVersion,
  archivePlan,
  listPlans,
  historyQuery,
} from "./schemas";
import type { VersionValues } from "./schemas";
import type { Plan, Catalog, VersionHistory } from "./types";
import { snapshotPlan } from "./types";
import { todayInZone } from "./format";
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new BusinessError(
      "VALIDATION_ERROR",
      r.error.issues
        .slice(0, 3)
        .map((i) => i.path.join(".") + ": " + i.message)
        .join("; "),
    );
  return r.data;
}
const versionJSON = `jsonb_build_object('id',v.id,'planId',v.plan_id,'version',v.version,'name',v.name,'amountMinor',v.amount_minor,'currency',v.currency,'durationUnit',v.duration_unit,'durationCount',v.duration_count,'accessMode',v.access_mode,'gymFloor',v.gym_floor,'classes',v.classes,'personalTraining',v.personal_training,'reason',v.reason,'createdAt',v.created_at)`;
const planFields = `p.id,p.code,p.branch_id as "branchId",b.name as "branchName",p.revision,to_jsonb(p.archived_at)#>>'{}' as "archivedAt",${versionJSON} as current`;
const planJoin = `gym.plans p join gym.branches b on b.organization_id=p.organization_id and b.id=p.branch_id join lateral (select * from gym.plan_versions where organization_id=p.organization_id and plan_id=p.id order by version desc limit 1) v on true`;
async function readPlan(
  db: PoolClient,
  scope: Scope,
  id: string,
  lock?: "update" | "share",
): Promise<Plan> {
  if (lock) {
    const r = await db.query(
      `select id from gym.plans where organization_id=$1 and id=$2 and branch_id=any($3::uuid[]) for ${lock}`,
      [scope.organizationId, id, [...scope.branchIds]],
    );
    if (!r.rowCount) throw new BusinessError("NOT_FOUND", "Plan not found.");
  }
  const row = (
    await db.query<Plan>(
      `select ${planFields} from ${planJoin} where p.organization_id=$1 and p.id=$2 and p.branch_id=any($3::uuid[])`,
      [scope.organizationId, id, [...scope.branchIds]],
    )
  ).rows[0];
  if (!row) throw new BusinessError("NOT_FOUND", "Plan not found.");
  return row;
}
async function checkCurrency(
  db: PoolClient,
  scope: Scope,
  values: VersionValues,
) {
  const org = (
    await db.query(
      "select currency from gym.organizations where id=$1 for share",
      [scope.organizationId],
    )
  ).rows[0];
  if (values.currency !== org.currency)
    throw new BusinessError(
      "VALIDATION_ERROR",
      "Use the current gym currency. Reload the catalog.",
    );
}
async function checkValues(
  db: PoolClient,
  scope: Scope,
  values: VersionValues,
) {
  await checkCurrency(db, scope, values);
  if (values.accessMode === "all_branches" && scope.role !== "owner")
    throw new BusinessError(
      "FORBIDDEN",
      "Only the owner can publish access across all gym branches.",
    );
}
export async function resolvePlanSnapshot(
  db: PoolClient,
  scope: Scope,
  versionId: string,
) {
  const row = (
    await db.query(
      "select plan_id from gym.plan_versions where organization_id=$1 and id=$2",
      [scope.organizationId, versionId],
    )
  ).rows[0];
  if (!row) throw new BusinessError("NOT_FOUND", "Plan not found.");
  const p = await readPlan(db, scope, row.plan_id, "share");
  if (p.archivedAt)
    throw new BusinessError(
      "CONFLICT",
      "This plan is archived. Choose an active plan.",
    );
  if (p.current.id !== versionId)
    throw new BusinessError(
      "CONFLICT",
      "The plan changed. Review the current version.",
    );
  await checkCurrency(db, scope, p.current);
  return snapshotPlan(p);
}
export function createPlansService(
  security: ReturnType<typeof createSecurity>,
) {
  async function list(headers: Headers, raw: unknown): Promise<Catalog> {
    const q = parse(listPlans, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId, branchId: q.branchId },
      "plans.read",
      async (db, scope) => {
        const organization = (
          await db.query(
            'select id,name,currency,locale,time_zone as "timeZone" from gym.organizations where id=$1',
            [scope.organizationId],
          )
        ).rows[0];
        const branches = (
          await db.query(
            "select id,name from gym.branches where id=any($1::uuid[]) order by name,id",
            [[...scope.authorizedBranchIds]],
          )
        ).rows;
        const where = `p.organization_id=$1 and p.branch_id=any($2::uuid[]) and (($3='active' and p.archived_at is null) or ($3='archived' and p.archived_at is not null)) and (p.code ilike $4 or v.name ilike $4)`;
        const result = (
          await db.query(
            `with filtered as (select ${planFields} from ${planJoin} where ${where}), tally as (select count(*)::int as total from filtered), bounds as (select total,greatest(1,least($5::int,(total+11)/12)) as page from tally) select total,page,coalesce((select jsonb_agg(r) from (select * from filtered order by current->>'name',code,id limit 12 offset(select (page-1)*12 from bounds))r),'[]'::jsonb) as plans from bounds`,
            [
              scope.organizationId,
              [...scope.branchIds],
              q.status,
              "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%",
              q.page,
            ],
          )
        ).rows[0];
        return {
          organization,
          branches,
          plans: result.plans,
          total: result.total,
          page: result.page,
          pageSize: 12,
          query: {
            ...q,
            organizationId: scope.organizationId,
            page: result.page,
          },
          canManage: can(scope.role, "plans.manage"),
          canManageSettings: can(scope.role, "settings.read"),
          canManageMembers: can(scope.role, "members.manage"),
          canUseAllBranches: scope.role === "owner",
          today: todayInZone(organization.timeZone),
          requestId: scope.requestId,
        };
      },
    );
  }
  async function history(
    headers: Headers,
    id: string,
    raw: unknown,
  ): Promise<VersionHistory> {
    parse(z.uuid(), id);
    const q = parse(historyQuery, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId },
      "plans.read",
      async (db, scope) => {
        const plan = await readPlan(db, scope, id, "share");
        const r = (
          await db.query(
            `with tally as (select count(*)::int total from gym.plan_versions where organization_id=$1 and plan_id=$2), bounds as(select total,greatest(1,least($3::int,(total+19)/20)) page from tally) select total,page,coalesce((select jsonb_agg(r) from(select ${versionJSON} as value from gym.plan_versions v where organization_id=$1 and plan_id=$2 order by version desc limit 20 offset(select (page-1)*20 from bounds))r),'[]'::jsonb) as versions from bounds`,
            [scope.organizationId, id, q.versionPage],
          )
        ).rows[0];
        return {
          plan,
          versions: r.versions.map((r: { value: unknown }) => r.value),
          total: r.total,
          page: r.page,
          pageSize: 20,
          requestId: scope.requestId,
        };
      },
    );
  }
  async function write(headers: Headers, raw: unknown, editing: boolean) {
    const input = editing ? parse(publishVersion, raw) : parse(createPlan, raw);
    return security.run(
      headers,
      { organizationId: input.organizationId },
      "plans.manage",
      async (db, scope) => {
        // Serialize request keys before parent rows; archive only needs the parent lock.
        await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          "plan-request:" +
            scope.organizationId +
            ":" +
            scope.userId +
            ":" +
            input.requestKey,
        ]);
        const hash = createHash("sha256")
          .update(JSON.stringify({ editing, ...input }))
          .digest("hex");
        const prior = (
          await db.query(
            "select plan_id,id,request_hash from gym.plan_versions where organization_id=$1 and created_by=$2 and request_key=$3",
            [scope.organizationId, scope.userId, input.requestKey],
          )
        ).rows[0];
        if (prior) {
          await readPlan(db, scope, prior.plan_id, "share");
          if (prior.request_hash !== hash)
            throw new BusinessError(
              "CONFLICT",
              "This save key was used with different details. Reload latest before starting a new change.",
            );
          return {
            id: prior.plan_id,
            versionId: prior.id,
            replayed: true,
            requestId: scope.requestId,
          };
        }
        await checkValues(db, scope, input.values);
        let id: string,
          next = 1;
        if ("id" in input) {
          const plan = await readPlan(db, scope, input.id, "update");
          if (plan.archivedAt)
            throw new BusinessError(
              "CONFLICT",
              "Restore this plan before editing.",
            );
          if (plan.revision !== input.revision)
            throw new BusinessError(
              "CONFLICT",
              "This plan changed. Your inputs are kept; reload latest before editing.",
            );
          id = plan.id;
          next = plan.current.version + 1;
          await db.query(
            "update gym.plans set revision=revision+1 where id=$1 and organization_id=$2",
            [id, scope.organizationId],
          );
        } else {
          if (!scope.branchIds.includes(input.branchId))
            throw new BusinessError("NOT_FOUND", "Branch not found.");
          const r = await db.query(
            "insert into gym.plans(organization_id,branch_id,code,created_by) values($1,$2,$3,$4) on conflict(organization_id,code) do nothing returning id",
            [scope.organizationId, input.branchId, input.code, scope.userId],
          );
          if (!r.rowCount)
            throw new BusinessError(
              "CONFLICT",
              "That plan code is already in use, including archived plans.",
            );
          id = r.rows[0].id;
        }
        const v = input.values;
        const row = (
          await db.query(
            `insert into gym.plan_versions(organization_id,plan_id,version,name,amount_minor,currency,duration_unit,duration_count,access_mode,gym_floor,classes,personal_training,reason,request_key,request_hash,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
            [
              scope.organizationId,
              id,
              next,
              v.name,
              v.amountMinor,
              v.currency,
              v.durationUnit,
              v.durationCount,
              v.accessMode,
              v.gymFloor,
              v.classes,
              v.personalTraining,
              input.reason,
              input.requestKey,
              hash,
              scope.userId,
            ],
          )
        ).rows[0];
        await audit(
          db,
          scope,
          editing ? "plan.version_published" : "plan.created",
          id,
          input.reason,
          null,
          { version: next, versionId: row.id, ...v },
        );
        return {
          id,
          versionId: row.id,
          replayed: false,
          requestId: scope.requestId,
        };
      },
    );
  }
  async function archive(headers: Headers, raw: unknown) {
    const input = parse(archivePlan, raw);
    return security.run(
      headers,
      { organizationId: input.organizationId },
      "plans.manage",
      async (db, scope) => {
        const plan = await readPlan(db, scope, input.id, "update");
        if (plan.revision !== input.revision)
          throw new BusinessError(
            "CONFLICT",
            "This plan changed. Reload latest before trying again.",
          );
        if (Boolean(plan.archivedAt) === input.archived)
          return { id: plan.id, requestId: scope.requestId };
        await db.query(
          "update gym.plans set archived_at=case when $3 then now() else null end,revision=revision+1 where organization_id=$1 and id=$2",
          [scope.organizationId, input.id, input.archived],
        );
        await audit(
          db,
          scope,
          input.archived ? "plan.archived" : "plan.restored",
          plan.id,
          input.reason,
          { archived: !!plan.archivedAt },
          { archived: input.archived },
        );
        return { id: plan.id, requestId: scope.requestId };
      },
    );
  }
  return {
    list,
    history,
    create: (h: Headers, r: unknown) => write(h, r, false),
    publish: (h: Headers, r: unknown) => write(h, r, true),
    archive,
  };
}
