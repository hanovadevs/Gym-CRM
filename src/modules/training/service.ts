import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { createSecurity, Scope } from "@/server/security/service";
import { BusinessError } from "@/server/errors";
import { audit } from "@/server/audit";
import { parse } from "@/modules/members/service";
import { can } from "@/server/security/permissions";
import type { TrainingDirectory } from "./types";
import { trainerInput, trainerQuery } from "./schemas";

export function createTrainingService(
  security: ReturnType<typeof createSecurity>,
) {
  async function directory(
    headers: Headers,
    raw: unknown,
  ): Promise<TrainingDirectory> {
    const q = parse(trainerQuery, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId, branchId: q.branchId },
      "trainers.read",
      async (db, s, _identity, context) => {
        // Trainers receive their own operational identity only, without contacts or other coaches.
        const own = s.role === "trainer";
        const rows = await db.query(
          `with candidates as (
        select t.id,t.name,t.specialties,t.active,t.version,
          case when $4 then '' else t.phone end phone,
          case when $4 then '' else t.email end email,
          case when $4 then null else t.login_user_id end as "loginUserId",
          coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name,b.id)
            from gym.trainer_branches tb join gym.branches b on b.organization_id=tb.organization_id and b.id=tb.branch_id
            where tb.organization_id=t.organization_id and tb.trainer_id=t.id and tb.active and tb.branch_id=any($6::uuid[])), '[]'::jsonb) branches,
          case when $8::boolean then (select e.id from gym.employees e where e.organization_id=t.organization_id and e.trainer_id=t.id and e.branch_id=any($6::uuid[]) limit 1) else null end as "employeeId",
          not exists(select 1 from gym.trainer_branches tb where tb.organization_id=t.organization_id and tb.trainer_id=t.id and tb.active and not(tb.branch_id=any($6::uuid[]))) as "canEdit"
        from gym.trainers t where t.organization_id=$1 and (not $4 or t.login_user_id=$5)
          and exists(select 1 from gym.trainer_branches tb where tb.organization_id=t.organization_id and tb.trainer_id=t.id and tb.active and tb.branch_id=any($2::uuid[]))
          and (t.name ilike $3 or t.specialties ilike $3)
      ), bounds as (select count(*)::int total,greatest(1,least($7::int,(count(*)::int+24)/25)) page from candidates)
      select total,page,coalesce((select jsonb_agg(r) from(select * from candidates order by name,id limit 25 offset(select(page-1)*25 from bounds))r),'[]'::jsonb) rows from bounds`,
          [
            s.organizationId,
            [...s.branchIds],
            "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%",
            own,
            s.userId,
            [...s.authorizedBranchIds],
            q.page,
            can(s.role, "payroll.manage"),
          ],
        );
        const logins =
          s.role === "owner" || s.role === "manager"
            ? (
                await db.query(
                  `select u.id,u.name,array(select g.branch_id from gym.staff_branch_grants g where g.organization_id=sm.organization_id and g.staff_membership_id=sm.id order by g.branch_id) as "branchIds"
          from gym.staff_memberships sm join app_auth."user" u on u.id=sm.auth_user_id
          where sm.organization_id=$1 and sm.active and sm.role='trainer'
            and not exists(select 1 from gym.staff_branch_grants g where g.organization_id=sm.organization_id and g.staff_membership_id=sm.id and not(g.branch_id=any($2::uuid[])))
          order by u.name,u.id limit 200`,
                  [s.organizationId, [...s.authorizedBranchIds]],
                )
              ).rows
            : [];
        return {
          ...rows.rows[0],
          logins,
          organizationId: s.organizationId,
          organization: {
            id: context.organization.id,
            name: context.organization.name,
          },
          branches: context.branches,
          branchId: q.branchId ?? "",
          q: q.q,
          canManageSettings: can(s.role, "settings.read"),
          canManageMembers: can(s.role, "members.manage"),
          canReadPlans: can(s.role, "plans.read"),
          canReadBilling: can(s.role, "billing.read"),
          own,
          canManage: s.role === "owner" || s.role === "manager",
          requestId: s.requestId,
        };
      },
    );
  }
  async function saveTrainer(headers: Headers, raw: unknown) {
    const v = parse(trainerInput, raw);
    try {
      return await security.run(
        headers,
        { organizationId: v.organizationId },
        "trainers.manage",
        async (db, s) => {
          const branchIds = [...v.branchIds].sort();
          ensureBranches(s, branchIds);
          await db.query(
            "select pg_advisory_xact_lock(hashtextextended($1,0))",
            [
              `schedule-request:${s.organizationId}:${s.userId}:${v.requestKey}`,
            ],
          );
          const hash = createHash("sha256")
            .update(JSON.stringify({ ...v, branchIds }))
            .digest("hex");
          const prior = (
            await db.query(
              "select request_hash,branch_ids,result from gym.schedule_requests where organization_id=$1 and actor_id=$2 and request_key=$3",
              [s.organizationId, s.userId, v.requestKey],
            )
          ).rows[0];
          if (prior) {
            ensureBranches(s, prior.branch_ids);
            if (prior.request_hash !== hash)
              throw new BusinessError(
                "CONFLICT",
                "This request was already used for another change.",
              );
            return { ...prior.result, requestId: s.requestId };
          }
          // Serialize with scheduling resource guards before locking the trainer row.
          await db.query(
            "select pg_advisory_xact_lock(hashtextextended($1,0))",
            [`schedule-trainer:${s.organizationId}:${v.id}`],
          );
          const before = (
            await db.query(
              "select * from gym.trainers where organization_id=$1 and id=$2 for update",
              [s.organizationId, v.id],
            )
          ).rows[0];
          if (v.version && !before)
            throw new BusinessError("NOT_FOUND", "Trainer unavailable.");
          if (before && (!v.version || before.version !== v.version))
            throw new BusinessError(
              "CONFLICT",
              "Trainer changed. Reload before saving.",
            );
          const mappings = (
            await db.query(
              "select branch_id,active from gym.trainer_branches where organization_id=$1 and trainer_id=$2",
              [s.organizationId, v.id],
            )
          ).rows;
          const affected = [
            ...new Set([
              ...branchIds,
              ...mappings
                .filter((r) => r.active)
                .map((r) => r.branch_id as string),
            ]),
          ].sort();
          ensureBranches(s, affected);
          if (v.loginUserId) {
            const eligible = await db.query(
              `select sm.id from gym.staff_memberships sm where sm.organization_id=$1 and sm.auth_user_id=$2 and sm.active and sm.role='trainer'
            and not exists(select 1 from unnest($3::uuid[]) b where not exists(select 1 from gym.staff_branch_grants g where g.organization_id=sm.organization_id and g.staff_membership_id=sm.id and g.branch_id=b)) for share`,
              [s.organizationId, v.loginUserId, branchIds],
            );
            if (!eligible.rowCount)
              throw new BusinessError(
                "VALIDATION_ERROR",
                "Link an active trainer staff login with access to every selected branch.",
              );
          }
          const values = [
            s.organizationId,
            v.id,
            v.name,
            v.specialties,
            v.phone,
            v.email,
            v.loginUserId,
            v.active,
            s.userId,
          ];
          if (before)
            await db.query(
              "update gym.trainers set name=$3,specialties=$4,phone=$5,email=$6,login_user_id=$7,active=$8,updated_by=$9,updated_at=clock_timestamp(),version=version+1 where organization_id=$1 and id=$2",
              values,
            );
          else
            await db.query(
              "insert into gym.trainers(organization_id,id,name,specialties,phone,email,login_user_id,active,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)",
              values,
            );
          for (const id of branchIds)
            await db.query(
              `insert into gym.trainer_branches(organization_id,trainer_id,branch_id,created_by,updated_by) values($1,$2,$3,$4,$4)
          on conflict(organization_id,trainer_id,branch_id) do update set active=true,version=gym.trainer_branches.version+1,updated_by=$4,updated_at=clock_timestamp() where not gym.trainer_branches.active`,
              [s.organizationId, v.id, id, s.userId],
            );
          await db.query(
            "update gym.trainer_branches set active=false,version=version+1,updated_by=$4,updated_at=clock_timestamp() where organization_id=$1 and trainer_id=$2 and active and not(branch_id=any($3::uuid[]))",
            [s.organizationId, v.id, branchIds, s.userId],
          );
          const result = {
            trainerId: v.id,
            version: before ? before.version + 1 : 1,
          };
          await audit(db, s, "trainer.save", v.id, v.reason, before ?? null, {
            ...result,
            name: v.name,
            branchIds,
            active: v.active,
          });
          await record(
            db,
            s,
            v.requestKey,
            hash,
            "trainer.save",
            affected,
            result,
          );
          return { ...result, requestId: s.requestId };
        },
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["23514", "23505", "40P01", "23503"].includes(String(error.code))
      )
        throw new BusinessError(
          "CONFLICT",
          "Trainer or schedule changed. Review branch access, linked login and upcoming sessions before retrying.",
        );
      throw error;
    }
  }
  return { directory, saveTrainer };
}
function ensureBranches(s: Scope, ids: string[]) {
  if (ids.some((id) => !s.authorizedBranchIds.includes(id)))
    throw new BusinessError(
      "FORBIDDEN",
      "Access to every affected branch is required.",
    );
}
async function record(
  db: PoolClient,
  s: Scope,
  key: string,
  hash: string,
  operation: string,
  branches: string[],
  result: unknown,
) {
  await db.query(
    "insert into gym.schedule_requests(organization_id,actor_id,request_key,request_hash,operation,branch_ids,result) values($1,$2,$3,$4,$5,$6,$7::jsonb)",
    [
      s.organizationId,
      s.userId,
      key,
      hash,
      operation,
      branches,
      JSON.stringify(result),
    ],
  );
}
