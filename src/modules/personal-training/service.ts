import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { createSecurity, Scope } from "@/server/security/service";
import { can } from "@/server/security/permissions";
import { BusinessError } from "@/server/errors";
import { audit } from "@/server/audit";
import { parse } from "@/modules/members/service";
import { todayInZone } from "@/modules/plans/format";
import { daysBetween } from "@/modules/memberships/state";
import { shiftDate } from "@/modules/classes/calendar";
import { agendaQuery, ptMutation, memberQuery } from "./schemas";
import type { Agenda } from "./types";
async function lock(db: PoolClient, key: string) {
  await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
}
function branches(s: Scope, ids: string[]) {
  if (ids.some((id) => !s.authorizedBranchIds.includes(id)))
    throw new BusinessError(
      "NOT_FOUND",
      "Training record unavailable in your branch scope.",
    );
}
export function createPersonalTrainingService(
  security: ReturnType<typeof createSecurity>,
) {
  async function get(headers: Headers, raw: unknown): Promise<Agenda> {
    const q = parse(agendaQuery, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId, branchId: q.branchId },
      "trainers.read",
      async (db, s, _identity, ctx) => {
        const today = todayInZone(ctx.organization.time_zone),
          from = q.from ?? today,
          to = q.to ?? shiftDate(from, 6);
        if (from > to || daysBetween(from, to) > 30)
          throw new BusinessError(
            "VALIDATION_ERROR",
            "Choose at most31calendar days.",
          );
        const data = (
          await db.query(
            `with visible as materialized(
   select t.id,t.name,t.active,coalesce(array_agg(distinct tb.branch_id) filter(where tb.active),array[]::uuid[]) as "branchIds" from gym.trainers t join gym.trainer_branches tb on tb.organization_id=t.organization_id and tb.trainer_id=t.id where t.organization_id=$1 and tb.branch_id=any($2::uuid[]) and (not $3::boolean or t.login_user_id=$4) group by t.id,t.name,t.active
  ), chosen as(select * from visible where $5::uuid is null or id=$5 order by active desc,name,id limit 1),
  assignments_all as materialized(select a.id,a.trainer_id as "trainerId",t.name as "trainerName",a.member_id as "memberId",m.name as "memberName",m.member_code as "memberCode",a.branch_id as "branchId",b.name as "branchName",a.start_on::text as "startOn",a.end_on_exclusive::text as "endOn",a.active,a.version,m.archived_at is not null archived from gym.trainer_assignments a join gym.trainers t on t.organization_id=a.organization_id and t.id=a.trainer_id join gym.members m on m.organization_id=a.organization_id and m.id=a.member_id join gym.branches b on b.organization_id=a.organization_id and b.id=a.branch_id where a.organization_id=$1 and a.branch_id=any($2::uuid[]) and a.trainer_id=(select id from chosen)), assignment_candidates as materialized(select * from assignments_all where "memberName" ilike $6 or "memberCode" ilike $6),
  assignment_bounds as(select count(*)::int total,greatest(1,least($7::int,(count(*)::int+24)/25)) page from assignment_candidates),
  session_candidates as materialized(select sl.id,p.assignment_id as "assignmentId",p.member_id as "memberId",m.name as "memberName",m.member_code as "memberCode",sl.trainer_id as "trainerId",t.name as "trainerName",sl.branch_id as "branchId",b.name as "branchName",sl.room_id as "roomId",r.name as "roomName",sl.title,sl.starts_at as "startsAt",sl.ends_at as "endsAt",(sl.starts_at at time zone $10)::date::text as "localDate",sl.cancelled_at is not null cancelled,sl.cancellation_reason as "cancellationReason",(sl.starts_at>statement_timestamp() and sl.cancelled_at is null) upcoming,sl.version from gym.schedule_slots sl join gym.personal_sessions p on p.organization_id=sl.organization_id and p.slot_id=sl.id join gym.members m on m.organization_id=p.organization_id and m.id=p.member_id join gym.trainers t on t.organization_id=sl.organization_id and t.id=sl.trainer_id join gym.branches b on b.organization_id=sl.organization_id and b.id=sl.branch_id left join gym.schedule_rooms r on r.organization_id=sl.organization_id and r.id=sl.room_id where sl.organization_id=$1 and sl.kind='pt' and sl.branch_id=any($2::uuid[]) and sl.trainer_id=(select id from chosen) and sl.ends_at>($8::date::timestamp at time zone $10) and sl.starts_at<(($9::date+1)::timestamp at time zone $10) and (m.name ilike $6 or m.member_code ilike $6 or sl.title ilike $6)),
  session_bounds as(select count(*)::int total,greatest(1,least($11::int,(count(*)::int+49)/50)) page from session_candidates)
  select (select id from chosen) as "trainerId",coalesce((select jsonb_agg(v order by v.active desc,v.name,v.id) from (select * from(select * from visible order by active desc,name,id limit 200)x union select * from chosen)v),'[]'::jsonb) trainers,
   coalesce((select jsonb_agg(a) from(select * from assignment_candidates order by active desc,"memberName","startOn" desc,id limit 25 offset(select(page-1)*25 from assignment_bounds))a),'[]'::jsonb) assignments,(select total from assignment_bounds) as "assignmentTotal",(select page from assignment_bounds) as "assignmentPage",
   coalesce((select jsonb_agg(a) from assignments_all a where a.id in(select "assignmentId" from session_candidates order by "startsAt",id limit 50 offset(select(page-1)*50 from session_bounds))),'[]'::jsonb) as "sessionAssignments",
   coalesce((select jsonb_agg(p) from(select * from session_candidates order by "startsAt",id limit 50 offset(select(page-1)*50 from session_bounds))p),'[]'::jsonb) sessions,(select total from session_bounds) total,(select page from session_bounds) page,
   coalesce((select jsonb_agg(r) from(select id,name,branch_id as "branchId" from gym.schedule_rooms where organization_id=$1 and branch_id=any($2::uuid[]) and active order by name,id limit 200)r),'[]'::jsonb) rooms,
   (select jsonb_build_object('id',id,'name',name,'locale',locale,'timeZone',time_zone,'today',$12::text) from gym.organizations where id=$1) organization`,
            [
              s.organizationId,
              [...s.branchIds],
              s.role === "trainer",
              s.userId,
              q.trainerId ?? null,
              "%" + q.q.replace(/[\%_]/g, "\$&") + "%",
              q.assignmentPage,
              from,
              to,
              ctx.organization.time_zone,
              q.page,
              today,
            ],
          )
        ).rows[0];
        if (q.trainerId && !data.trainerId)
          throw new BusinessError(
            "NOT_FOUND",
            "Trainer unavailable in your branch scope.",
          );
        return {
          ...data,
          branches: ctx.branches,
          from,
          to,
          query: {
            ...q,
            organizationId: s.organizationId,
            trainerId: data.trainerId ?? undefined,
            page: data.page,
            assignmentPage: data.assignmentPage,
          },
          own: s.role === "trainer",
          canManage: can(s.role, "trainers.manage"),
          canBook: can(s.role, "training.book"),
          canManageSettings: can(s.role, "settings.read"),
          canManageMembers: can(s.role, "members.manage"),
          canReadPlans: can(s.role, "plans.read"),
          canReadBilling: can(s.role, "billing.read"),
          requestId: s.requestId,
        };
      },
    );
  }
  async function members(headers: Headers, raw: unknown) {
    const q = parse(memberQuery, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId, branchId: q.branchId },
      "trainers.manage",
      async (db, s) => {
        const coach = (
          await db.query(
            "select t.id from gym.trainers t join gym.trainer_branches b on b.organization_id=t.organization_id and b.trainer_id=t.id where t.organization_id=$1 and t.id=$2 and b.branch_id=$3 and b.active and t.active",
            [s.organizationId, q.trainerId, q.branchId],
          )
        ).rows[0];
        if (!coach)
          throw new BusinessError(
            "NOT_FOUND",
            "Active trainer unavailable in this branch.",
          );
        const rows = (
          await db.query(
            `select id,name,member_code as "memberCode",joined_on::text as "joinedOn" from gym.members where organization_id=$1 and home_branch_id=any($2::uuid[]) and archived_at is null and (name ilike $3 or member_code ilike $3) order by name,id limit 25`,
            [
              s.organizationId,
              [...s.authorizedBranchIds],
              "%" + q.q.replace(/[\%_]/g, "\$&") + "%",
            ],
          )
        ).rows;
        return { rows, requestId: s.requestId };
      },
    );
  }
  async function post(headers: Headers, raw: unknown) {
    const v = parse(ptMutation, raw);
    try {
      return await security.run(
        headers,
        { organizationId: v.organizationId },
        v.operation === "assignment" ? "trainers.manage" : "training.book",
        async (db, s, _identity, ctx) => {
          await lock(
            db,
            `schedule-request:${s.organizationId}:${s.userId}:${v.requestKey}`,
          );
          const hash = createHash("sha256")
            .update(JSON.stringify({ module: "pt", ...v }))
            .digest("hex");
          const prior = (
            await db.query(
              "select request_hash,branch_ids,result from gym.schedule_requests where organization_id=$1 and actor_id=$2 and request_key=$3",
              [s.organizationId, s.userId, v.requestKey],
            )
          ).rows[0];
          if (prior) {
            branches(s, prior.branch_ids);
            if (prior.request_hash !== hash)
              throw new BusinessError(
                "CONFLICT",
                "This request was saved with different details. Reload before another change.",
              );
            return { ...prior.result, requestId: s.requestId, replayed: true };
          }
          let result: Record<string, unknown>,
            affected: string[],
            before: Record<string, unknown> | null = null;
          if (v.operation === "assignment") {
            branches(s, [v.branchId]);
            await lock(
              db,
              `schedule-trainer:${s.organizationId}:${v.trainerId}`,
            );
            await lock(db, `schedule-member:${s.organizationId}:${v.memberId}`);
            before =
              (
                await db.query(
                  "select * from gym.trainer_assignments where organization_id=$1 and id=$2 for update",
                  [s.organizationId, v.id],
                )
              ).rows[0] ?? null;
            if (before) {
              branches(s, [String(before.branch_id)]);
              if (
                before.version !== v.version ||
                before.branch_id !== v.branchId ||
                before.trainer_id !== v.trainerId ||
                before.member_id !== v.memberId
              )
                throw new BusinessError(
                  "CONFLICT",
                  "Assignment changed. Member, trainer and branch are fixed; create a replacement to change them.",
                );
            } else if (v.version)
              throw new BusinessError(
                "CONFLICT",
                "Assignment no longer exists.",
              );
            const member = (
              await db.query(
                "select id,joined_on::text joined_on,archived_at from gym.members where organization_id=$1 and id=$2 and home_branch_id=any($3::uuid[]) for share",
                [s.organizationId, v.memberId, [...s.authorizedBranchIds]],
              )
            ).rows[0];
            if (!member)
              throw new BusinessError(
                "NOT_FOUND",
                "Member unavailable in your branch scope.",
              );
            if (
              (v.active && member.archived_at) ||
              v.startOn < member.joined_on ||
              (v.endOn && v.endOn <= v.startOn)
            )
              throw new BusinessError(
                "VALIDATION_ERROR",
                "Choose valid assignment dates after joining; restore an archived member before assigning active coaching.",
              );
            const binds = [
              s.organizationId,
              v.id,
              v.trainerId,
              v.branchId,
              v.memberId,
              v.startOn,
              v.endOn,
              v.active,
              s.userId,
            ];
            const saved = before
              ? (
                  await db.query(
                    "update gym.trainer_assignments set start_on=$6,end_on_exclusive=$7,active=$8,version=version+1,updated_by=$9,updated_at=clock_timestamp() where organization_id=$1 and id=$2 and trainer_id=$3 and branch_id=$4 and member_id=$5 returning version",
                    binds,
                  )
                ).rows[0]
              : (
                  await db.query(
                    "insert into gym.trainer_assignments(organization_id,id,trainer_id,branch_id,member_id,start_on,end_on_exclusive,active,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) returning version",
                    binds,
                  )
                ).rows[0];
            result = { assignmentId: v.id, version: saved.version };
            affected = [v.branchId];
          } else {
            await lock(db, `schedule-pt:${s.organizationId}:${v.id}`);
            before =
              (
                await db.query(
                  `select s.*,p.member_id,p.assignment_id from gym.schedule_slots s join gym.personal_sessions p on p.organization_id=s.organization_id and p.slot_id=s.id where s.organization_id=$1 and s.id=$2 and s.kind='pt' for update of s`,
                  [s.organizationId, v.id],
                )
              ).rows[0] ?? null;
            if (before) branches(s, [String(before.branch_id)]);
            if (v.operation === "cancel") {
              if (!before)
                throw new BusinessError(
                  "NOT_FOUND",
                  "Personal session unavailable.",
                );
              if (
                before.version !== v.version ||
                before.cancelled_at ||
                Date.parse(String(before.starts_at)) <= Date.now()
              )
                throw new BusinessError(
                  "CONFLICT",
                  "Only unchanged upcoming personal sessions can be cancelled.",
                );
              await db.query(
                "update gym.schedule_slots set cancelled_at=clock_timestamp(),cancelled_by=$3,cancellation_reason=$4,version=version+1,updated_by=$3,updated_at=clock_timestamp() where organization_id=$1 and id=$2",
                [s.organizationId, v.id, s.userId, v.reason],
              );
              result = {
                sessionId: v.id,
                version: v.version + 1,
                cancelled: true,
              };
              affected = [String(before.branch_id)];
            } else {
              const assignment = (
                await db.query(
                  "select * from gym.trainer_assignments where organization_id=$1 and id=$2 and branch_id=any($3::uuid[]) for share",
                  [
                    s.organizationId,
                    v.assignmentId,
                    [...s.authorizedBranchIds],
                  ],
                )
              ).rows[0];
              if (!assignment)
                throw new BusinessError("NOT_FOUND", "Assignment unavailable.");
              branches(s, [assignment.branch_id]);
              if (
                (before &&
                  (before.version !== v.version ||
                    before.assignment_id !== v.assignmentId ||
                    before.cancelled_at)) ||
                (!before && v.version)
              )
                throw new BusinessError(
                  "CONFLICT",
                  "Personal session changed. Its member assignment is fixed; cancel and create a replacement to change it.",
                );
              if (
                Date.parse(v.startsAt) <= Date.now() ||
                Date.parse(v.endsAt) <= Date.parse(v.startsAt) ||
                Date.parse(v.endsAt) - Date.parse(v.startsAt) > 86400000
              )
                throw new BusinessError(
                  "VALIDATION_ERROR",
                  "Schedule a future session lasting at most24hours.",
                );
              const clock = (
                await db.query(
                  "select (($1::text::timestamptz at time zone $3)=$1::text::timestamp and ($2::text::timestamptz at time zone $3)=$2::text::timestamp) valid",
                  [v.startsAt, v.endsAt, ctx.organization.time_zone],
                )
              ).rows[0];
              if (!clock.valid)
                throw new BusinessError(
                  "VALIDATION_ERROR",
                  "Review the UTC offsets for this gym time zone and selected date.",
                );
              await lock(
                db,
                `schedule-trainer:${s.organizationId}:${assignment.trainer_id}`,
              );
              for (const room of [
                ...new Set([before?.room_id, v.roomId].filter(Boolean)),
              ].sort())
                await lock(db, `schedule-room:${s.organizationId}:${room}`);
              await lock(
                db,
                `schedule-member:${s.organizationId}:${assignment.member_id}`,
              );
              const binds = [
                s.organizationId,
                v.id,
                assignment.branch_id,
                assignment.trainer_id,
                v.roomId,
                v.title,
                v.startsAt,
                v.endsAt,
                s.userId,
              ];
              const saved = before
                ? (
                    await db.query(
                      "update gym.schedule_slots set room_id=$5,title=$6,starts_at=$7,ends_at=$8,version=version+1,updated_by=$9,updated_at=clock_timestamp() where organization_id=$1 and id=$2 and branch_id=$3 and trainer_id=$4 returning version",
                      binds,
                    )
                  ).rows[0]
                : (
                    await db.query(
                      "insert into gym.schedule_slots(organization_id,id,branch_id,trainer_id,room_id,title,starts_at,ends_at,created_by,updated_by,kind) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,'pt') returning version",
                      binds,
                    )
                  ).rows[0];
              if (!before)
                await db.query(
                  "insert into gym.personal_sessions(organization_id,slot_id,branch_id,trainer_id,member_id,assignment_id,created_by) values($1,$2,$3,$4,$5,$6,$7)",
                  [
                    s.organizationId,
                    v.id,
                    assignment.branch_id,
                    assignment.trainer_id,
                    assignment.member_id,
                    assignment.id,
                    s.userId,
                  ],
                );
              result = { sessionId: v.id, version: saved.version };
              affected = [assignment.branch_id];
            }
          }
          await audit(
            db,
            s,
            "pt." + v.operation,
            v.id,
            v.reason,
            before,
            result,
          );
          await db.query(
            "insert into gym.schedule_requests(organization_id,actor_id,request_key,request_hash,operation,branch_ids,result) values($1,$2,$3,$4,$5,$6,$7::jsonb)",
            [
              s.organizationId,
              s.userId,
              v.requestKey,
              hash,
              "pt." + v.operation,
              affected,
              JSON.stringify(result),
            ],
          );
          return { ...result, requestId: s.requestId, replayed: false };
        },
      );
    } catch (e) {
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        ["23514", "23505", "23503", "40P01"].includes(String(e.code))
      )
        throw new BusinessError(
          "CONFLICT",
          "Training change conflicts with current assignment, membership eligibility, trainer availability, room or member agenda. Resolve upcoming sessions before ending assignments.",
        );
      throw e;
    }
  }
  return { get, members, post };
}
