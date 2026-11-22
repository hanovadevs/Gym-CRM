import { shiftDate } from "./calendar";
import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { createSecurity, Scope } from "@/server/security/service";
import { BusinessError } from "@/server/errors";
import { can } from "@/server/security/permissions";
import { parse } from "@/modules/members/service";
import { todayInZone } from "@/modules/plans/format";
import { daysBetween } from "@/modules/memberships/state";
import { audit } from "@/server/audit";
import { classQuery, classMutation, memberQuery } from "./schemas";
import type { ClassData, ClassMember } from "./types";
async function lock(db: PoolClient, key: string) {
  await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
}
function ensure(s: Scope, ids: string[]) {
  if (ids.some((id) => !s.authorizedBranchIds.includes(id)))
    throw new BusinessError(
      "NOT_FOUND",
      "Scheduling record unavailable in your branch scope.",
    );
}
export function createClassesService(
  security: ReturnType<typeof createSecurity>,
) {
  async function get(headers: Headers, raw: unknown): Promise<ClassData> {
    const q = parse(classQuery, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId, branchId: q.branchId },
      "classes.read",
      async (db, s, _user, ctx) => {
        const today = todayInZone(ctx.organization.time_zone),
          anchor = q.from ?? today,
          weekday = (new Date(anchor + "T12:00:00Z").getUTCDay() + 6) % 7,
          from = q.mode === "week" ? shiftDate(anchor, -weekday) : anchor,
          to =
            q.mode === "day"
              ? from
              : q.mode === "week"
                ? shiftDate(from, 6)
                : (q.to ?? shiftDate(from, 30));
        if (from > to || daysBetween(from, to) > 30)
          throw new BusinessError(
            "VALIDATION_ERROR",
            "Choose at most 31 calendar days.",
          );
        const data = (
          await db.query(
            `
with candidates as materialized (
 select s.id,s.branch_id as "branchId",b.name as "branchName",s.trainer_id as "trainerId",t.name as "trainerName",s.room_id as "roomId",r.name as "roomName",s.title,s.starts_at as "startsAt",s.ends_at as "endsAt",(s.starts_at at time zone $3)::date::text as "localDate",c.capacity,(select count(*)::int from gym.class_bookings x where x.organization_id=s.organization_id and x.slot_id=s.id and x.cancelled_at is null) booked,s.version,c.version as "classVersion",s.cancelled_at is not null cancelled,s.cancellation_reason as "cancellationReason",(s.starts_at>statement_timestamp() and s.cancelled_at is null) upcoming
 from gym.schedule_slots s join gym.class_sessions c on c.organization_id=s.organization_id and c.slot_id=s.id join gym.trainers t on t.organization_id=s.organization_id and t.id=s.trainer_id join gym.branches b on b.organization_id=s.organization_id and b.id=s.branch_id left join gym.schedule_rooms r on r.organization_id=s.organization_id and r.id=s.room_id
 where s.organization_id=$1 and s.branch_id=any($2::uuid[]) and s.starts_at>=($4::date::timestamp at time zone $3) and s.starts_at<(($5::date+1)::timestamp at time zone $3) and ($6::uuid is null or s.trainer_id=$6) and (not $7::boolean or t.login_user_id=$8)
), bounds as(select count(*)::int total,greatest(1,least($9::int,(count(*)::int+49)/50)) page from candidates),
chosen as(select * from candidates where $10::uuid is null or id=$10 order by "startsAt",id limit 1 offset case when $10::uuid is null then (select(page-1)*50 from bounds) else 0 end),
coaches as materialized(select t.id,t.name,array_agg(b.branch_id order by b.branch_id) as "branchIds" from gym.trainers t join gym.trainer_branches b on b.organization_id=t.organization_id and b.trainer_id=t.id and b.active where t.organization_id=$1 and t.active and b.branch_id=any($11::uuid[]) and (not $7::boolean or t.login_user_id=$8) group by t.id,t.name order by t.name,t.id limit 200),
availability_candidates as materialized(select a.id,a.trainer_id as "trainerId",a.branch_id as "branchId",b.name as "branchName",a.weekday,a.start_minute as "startMinute",a.end_minute as "endMinute",a.active,a.version from gym.trainer_availability a join gym.branches b on b.organization_id=a.organization_id and b.id=a.branch_id join gym.trainers t on t.organization_id=a.organization_id and t.id=a.trainer_id where a.organization_id=$1 and a.branch_id=any($2::uuid[]) and a.trainer_id=coalesce($6::uuid,(select id from coaches limit 1)) and (not $7::boolean or t.login_user_id=$8)),
availability_bounds as(select count(*)::int total,greatest(1,least($13::int,(count(*)::int+24)/25)) page from availability_candidates),
roster_candidates as materialized(select x.id,x.member_id as "memberId",m.name,m.member_code as "memberCode",x.version,x.cancelled_at is not null cancelled,x.cancellation_reason as "cancellationReason",x.created_at sort_at from gym.class_bookings x join gym.members m on m.organization_id=x.organization_id and m.id=x.member_id where x.organization_id=$1 and x.slot_id=(select id from chosen)),
roster_bounds as(select count(*)::int total,greatest(1,least($12::int,(count(*)::int+24)/25)) page from roster_candidates)
select bounds.total,bounds.page,
 coalesce((select jsonb_agg(r) from(select * from candidates order by "startsAt",id limit 50 offset(select(page-1)*50 from bounds))r),'[]'::jsonb) rows,
 (select to_jsonb(r) from chosen r) selected,
 coalesce((select jsonb_agg(to_jsonb(r)-'sort_at') from(select * from roster_candidates order by cancelled,sort_at,id limit 25 offset(select(page-1)*25 from roster_bounds))r),'[]'::jsonb) roster,(select total from roster_bounds) as "rosterTotal",(select page from roster_bounds) as "rosterPage",
 coalesce((select jsonb_agg(r) from coaches r),'[]'::jsonb) trainers,
 coalesce((select jsonb_agg(r) from(select r.id,r.branch_id as "branchId",b.name as "branchName",r.name,r.capacity,r.active,r.version from gym.schedule_rooms r join gym.branches b on b.organization_id=r.organization_id and b.id=r.branch_id where r.organization_id=$1 and r.branch_id=any($11::uuid[]) order by r.active desc,r.name,r.id limit 200)r),'[]'::jsonb) rooms,
 coalesce((select jsonb_agg(r) from(select * from availability_candidates order by weekday,"startMinute",id limit 25 offset(select(page-1)*25 from availability_bounds))r),'[]'::jsonb) availability,(select total from availability_bounds) as "availabilityTotal",(select page from availability_bounds) as "availabilityPage",coalesce($6::uuid,(select id from coaches limit 1)) as "availabilityTrainerId",
 (select jsonb_build_object('id',id,'name',name,'locale',locale,'timeZone',time_zone,'today',$14::text) from gym.organizations where id=$1) organization
from bounds`,
            [
              s.organizationId,
              [...s.branchIds],
              ctx.organization.time_zone,
              from,
              to,
              q.trainerId ?? null,
              s.role === "trainer",
              s.userId,
              q.page,
              q.classId ?? null,
              [...s.authorizedBranchIds],
              q.rosterPage,
              q.availabilityPage,
              today,
            ],
          )
        ).rows[0];
        if (q.classId && !data.selected)
          throw new BusinessError(
            "NOT_FOUND",
            "Class unavailable in this date/branch selection.",
          );
        return {
          ...data,
          branches: ctx.branches,
          branchId: q.branchId ?? "",
          trainerId: q.trainerId ?? "",
          from,
          to,
          mode: q.mode,
          canManage: can(s.role, "classes.manage"),
          canBook: can(s.role, "classes.book"),
          own: s.role === "trainer",
          canManageSettings: can(s.role, "settings.read"),
          canManageMembers: can(s.role, "members.manage"),
          canReadPlans: can(s.role, "plans.read"),
          canReadBilling: can(s.role, "billing.read"),
          requestId: s.requestId,
        };
      },
    );
  }
  async function members(
    headers: Headers,
    raw: unknown,
  ): Promise<{ rows: ClassMember[]; requestId: string }> {
    const q = parse(memberQuery, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId },
      "classes.book",
      async (db, s) => {
        const slot = (
          await db.query(
            `select * from gym.schedule_slots where organization_id=$1 and id=$2 and kind='class' and branch_id=any($3::uuid[]) and cancelled_at is null and starts_at>clock_timestamp()`,
            [s.organizationId, q.classId, [...s.branchIds]],
          )
        ).rows[0];
        if (!slot)
          throw new BusinessError("NOT_FOUND", "Upcoming class unavailable.");
        const rows = (
          await db.query(
            `select m.id,m.name,m.member_code as "memberCode",gym.class_member_eligible(m.organization_id,m.id,$2,$3,$4) eligible,gym.class_member_conflict(m.organization_id,m.id,$3,$4,$5) conflict,exists(select 1 from gym.class_bookings b where b.organization_id=m.organization_id and b.member_id=m.id and b.slot_id=$5 and b.cancelled_at is null) booked from gym.members m where m.organization_id=$1 and m.archived_at is null and (m.home_branch_id=any($7::uuid[]) or gym.class_member_eligible(m.organization_id,m.id,$2,$3,$4)) and (m.name ilike $6 or m.member_code ilike $6) order by m.name,m.id limit 20`,
            [
              s.organizationId,
              slot.branch_id,
              slot.starts_at,
              slot.ends_at,
              slot.id,
              "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%",
              [...s.authorizedBranchIds],
            ],
          )
        ).rows;
        return { rows, requestId: s.requestId };
      },
    );
  }
  async function post(headers: Headers, raw: unknown) {
    const v = parse(classMutation, raw);
    try {
      return await security.run(
        headers,
        { organizationId: v.organizationId },
        v.operation === "book" || v.operation === "cancel_booking"
          ? "classes.book"
          : "classes.manage",
        async (db, s, _user, ctx) => {
          await lock(
            db,
            `schedule-request:${s.organizationId}:${s.userId}:${v.requestKey}`,
          );
          const hash = createHash("sha256")
              .update(JSON.stringify(v))
              .digest("hex"),
            prior = (
              await db.query(
                "select request_hash,branch_ids,result from gym.schedule_requests where organization_id=$1 and actor_id=$2 and request_key=$3",
                [s.organizationId, s.userId, v.requestKey],
              )
            ).rows[0];
          if (prior) {
            ensure(s, prior.branch_ids);
            if (prior.request_hash !== hash)
              throw new BusinessError(
                "CONFLICT",
                "This reviewed request was already used for another schedule change.",
              );
            return { ...prior.result, requestId: s.requestId };
          }
          let result: Record<string, unknown>, affected: string[];
          if (v.operation === "room") {
            ensure(s, [v.branchId]);
            await lock(db, `schedule-room:${s.organizationId}:${v.id}`);
            const old = (
              await db.query(
                "select * from gym.schedule_rooms where organization_id=$1 and id=$2",
                [s.organizationId, v.id],
              )
            ).rows[0];
            if (old) ensure(s, [old.branch_id]);
            if (
              (old &&
                (old.version !== v.version || old.branch_id !== v.branchId)) ||
              (!old && v.version)
            )
              throw new BusinessError(
                "CONFLICT",
                "Room changed. Reload before editing.",
              );
            const values = [
              s.organizationId,
              v.id,
              v.branchId,
              v.name,
              v.capacity,
              v.active,
              s.userId,
            ];
            if (old)
              await db.query(
                "update gym.schedule_rooms set name=$4,normalized_name=lower(btrim($4)),capacity=$5,active=$6,version=version+1,updated_by=$7,updated_at=clock_timestamp() where organization_id=$1 and id=$2 and branch_id=$3",
                values,
              );
            else
              await db.query(
                "insert into gym.schedule_rooms(organization_id,id,branch_id,name,normalized_name,capacity,active,created_by,updated_by) values($1,$2,$3,$4,lower(btrim($4)),$5,$6,$7,$7)",
                values,
              );
            affected = [v.branchId];
            result = { roomId: v.id, branchId: v.branchId };
          } else if (v.operation === "availability") {
            ensure(s, [v.branchId]);
            await lock(
              db,
              `schedule-trainer:${s.organizationId}:${v.trainerId}`,
            );
            if (
              !(
                await db.query(
                  "select t.id from gym.trainers t join gym.trainer_branches b on b.organization_id=t.organization_id and b.trainer_id=t.id where t.organization_id=$1 and t.id=$2 and t.active and b.branch_id=$3 and b.active for share of t,b",
                  [s.organizationId, v.trainerId, v.branchId],
                )
              ).rowCount
            )
              throw new BusinessError(
                "NOT_FOUND",
                "Choose an active trainer assigned to this branch.",
              );
            const old = (
              await db.query(
                "select * from gym.trainer_availability where organization_id=$1 and id=$2",
                [s.organizationId, v.id],
              )
            ).rows[0];
            if (old) ensure(s, [old.branch_id]);
            if (
              (old &&
                (old.version !== v.version ||
                  old.branch_id !== v.branchId ||
                  old.trainer_id !== v.trainerId ||
                  old.weekday !== v.weekday)) ||
              (!old && v.version)
            )
              throw new BusinessError(
                "CONFLICT",
                "Availability identity or version changed. Reload before editing.",
              );
            const values = [
              s.organizationId,
              v.id,
              v.trainerId,
              v.branchId,
              v.weekday,
              v.startMinute,
              v.endMinute,
              v.active,
              s.userId,
            ];
            if (old)
              await db.query(
                "update gym.trainer_availability set start_minute=$6,end_minute=$7,active=$8,version=version+1,updated_by=$9,updated_at=clock_timestamp() where organization_id=$1 and id=$2 and trainer_id=$3 and branch_id=$4 and weekday=$5",
                values,
              );
            else
              await db.query(
                "insert into gym.trainer_availability(organization_id,id,trainer_id,branch_id,weekday,start_minute,end_minute,active,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)",
                values,
              );
            affected = [v.branchId];
            result = {
              availabilityId: v.id,
              trainerId: v.trainerId,
              branchId: v.branchId,
            };
          } else {
            const classId = v.operation === "session" ? v.id : v.classId;
            await lock(db, `schedule-class:${s.organizationId}:${classId}`);
            const old = (
              await db.query(
                `select s.*,c.capacity,c.version class_version,(s.starts_at at time zone $3)::date::text local_date from gym.schedule_slots s join gym.class_sessions c on c.organization_id=s.organization_id and c.slot_id=s.id where s.organization_id=$1 and s.id=$2 and s.kind='class'`,
                [s.organizationId, classId, ctx.organization.time_zone],
              )
            ).rows[0];
            if (old) ensure(s, [old.branch_id]);
            if (v.operation === "session") {
              ensure(s, [v.branchId]);
              if (
                (old &&
                  (old.version !== v.version ||
                    old.branch_id !== v.branchId ||
                    old.trainer_id !== v.trainerId)) ||
                (!old && v.version)
              )
                throw new BusinessError(
                  "CONFLICT",
                  "Class changed. Branch and trainer are fixed; cancel and create a replacement to change them.",
                );
              if (old?.cancelled_at)
                throw new BusinessError(
                  "CONFLICT",
                  "Cancelled sessions stay in history. Create a new session.",
                );
              if (
                Date.parse(v.startsAt) <= Date.now() ||
                Date.parse(v.endsAt) <= Date.parse(v.startsAt) ||
                Date.parse(v.endsAt) - Date.parse(v.startsAt) > 86400000
              )
                throw new BusinessError(
                  "VALIDATION_ERROR",
                  "Schedule a future session lasting at most 24 hours.",
                );
              const clock = (
                await db.query(
                  "select (($1::text::timestamptz at time zone $3)=$1::text::timestamp and ($2::text::timestamptz at time zone $3)=$2::text::timestamp) valid,($1::text::timestamptz at time zone $3)::date::text local_date",
                  [v.startsAt, v.endsAt, ctx.organization.time_zone],
                )
              ).rows[0];
              if (!clock.valid)
                throw new BusinessError(
                  "VALIDATION_ERROR",
                  "The UTC offset does not match this gym time zone on the selected date. Review both time offsets.",
                );
              await lock(
                db,
                `schedule-trainer:${s.organizationId}:${v.trainerId}`,
              );
              for (const room of [
                ...new Set([old?.room_id, v.roomId].filter(Boolean)),
              ].sort())
                await lock(db, `schedule-room:${s.organizationId}:${room}`);
              const capacityValues = [
                s.organizationId,
                classId,
                v.capacity,
                s.userId,
              ];
              if (old && v.capacity <= old.capacity)
                await db.query(
                  "update gym.class_sessions set capacity=$3,version=version+1,updated_by=$4,updated_at=clock_timestamp() where organization_id=$1 and slot_id=$2",
                  capacityValues,
                );
              const values = [
                s.organizationId,
                classId,
                v.branchId,
                v.trainerId,
                v.roomId,
                v.title,
                v.startsAt,
                v.endsAt,
                s.userId,
              ];
              if (old)
                await db.query(
                  "update gym.schedule_slots set room_id=$5,title=$6,starts_at=$7,ends_at=$8,version=version+1,updated_by=$9,updated_at=clock_timestamp() where organization_id=$1 and id=$2 and branch_id=$3 and trainer_id=$4",
                  values,
                );
              else
                await db.query(
                  `insert into gym.schedule_slots(organization_id,id,branch_id,trainer_id,room_id,title,starts_at,ends_at,created_by,updated_by,kind) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,'class')`,
                  values,
                );
              if (old && v.capacity > old.capacity)
                await db.query(
                  "update gym.class_sessions set capacity=$3,version=version+1,updated_by=$4,updated_at=clock_timestamp() where organization_id=$1 and slot_id=$2",
                  capacityValues,
                );
              else if (!old)
                await db.query(
                  "insert into gym.class_sessions(organization_id,slot_id,branch_id,trainer_id,capacity,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$6)",
                  [
                    s.organizationId,
                    classId,
                    v.branchId,
                    v.trainerId,
                    v.capacity,
                    s.userId,
                  ],
                );
              affected = [v.branchId];
              result = {
                classId,
                branchId: v.branchId,
                date: clock.local_date,
              };
            } else {
              if (!old)
                throw new BusinessError("NOT_FOUND", "Class unavailable.");
              if (
                old.cancelled_at ||
                new Date(old.starts_at).getTime() <= Date.now()
              )
                throw new BusinessError(
                  "CONFLICT",
                  "Only active upcoming class sessions can change.",
                );
              affected = [old.branch_id];
              result = {
                classId,
                branchId: old.branch_id,
                date: old.local_date,
              };
              if (v.operation === "cancel_session") {
                if (old.version !== v.version)
                  throw new BusinessError(
                    "CONFLICT",
                    "Class changed. Reload before cancelling.",
                  );
                await db.query(
                  "update gym.schedule_slots set cancelled_at=clock_timestamp(),cancelled_by=$3,cancellation_reason=$4,version=version+1,updated_by=$3,updated_at=clock_timestamp() where organization_id=$1 and id=$2",
                  [s.organizationId, classId, s.userId, v.reason],
                );
              } else if (v.operation === "book") {
                const booking = (
                  await db.query(
                    "insert into gym.class_bookings(organization_id,slot_id,branch_id,member_id,created_by) values($1,$2,$3,$4,$5) returning id",
                    [
                      s.organizationId,
                      classId,
                      old.branch_id,
                      v.memberId,
                      s.userId,
                    ],
                  )
                ).rows[0];
                result = { ...result, bookingId: booking.id };
              } else {
                const booking = (
                  await db.query(
                    "select id,version,cancelled_at from gym.class_bookings where organization_id=$1 and slot_id=$2 and id=$3 and branch_id=$4",
                    [s.organizationId, classId, v.bookingId, old.branch_id],
                  )
                ).rows[0];
                if (!booking)
                  throw new BusinessError("NOT_FOUND", "Booking unavailable.");
                if (booking.version !== v.version || booking.cancelled_at)
                  throw new BusinessError(
                    "CONFLICT",
                    "Booking changed. Reload before cancelling.",
                  );
                await db.query(
                  "update gym.class_bookings set cancelled_at=clock_timestamp(),cancelled_by=$4,cancellation_reason=$5,version=version+1 where organization_id=$1 and slot_id=$2 and id=$3",
                  [s.organizationId, classId, v.bookingId, s.userId, v.reason],
                );
                result = { ...result, bookingId: v.bookingId };
              }
            }
          }
          await audit(
            db,
            s,
            "class." + v.operation,
            String(result.classId ?? result.roomId ?? result.availabilityId),
            v.reason,
            null,
            { ...result, operation: v.operation },
          );
          await db.query(
            "insert into gym.schedule_requests(organization_id,actor_id,request_key,request_hash,operation,branch_ids,result) values($1,$2,$3,$4,$5,$6,$7::jsonb)",
            [
              s.organizationId,
              s.userId,
              v.requestKey,
              hash,
              "class." + v.operation,
              affected,
              JSON.stringify(result),
            ],
          );
          return { ...result, requestId: s.requestId };
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
          "The class is full, a member is ineligible, or this change conflicts with saved trainer availability, room capacity or another session. Reload and review current details.",
        );
      throw e;
    }
  }
  return { get, post, members };
}
