import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { createSecurity, Scope } from "@/server/security/service";
import { can } from "@/server/security/permissions";
import { audit } from "@/server/audit";
import { BusinessError } from "@/server/errors";
import { parse, registerMemberInTransaction } from "@/modules/members/service";
import { createMember } from "@/modules/members/schemas";
import { enrollMemberInTransaction } from "@/modules/memberships/service";
import { todayInZone } from "@/modules/plans/format";
import { enquiryQuery, enquiryMutation } from "./schemas";

export type Enquiry = {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  email: string;
  phone: string;
  interest: string;
  contactAllowed: boolean;
  stage: string;
  trialAt: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  convertedMemberId: string | null;
  version: number;
};
export type FollowUp = {
  id: string;
  enquiryId: string;
  name: string;
  action: string;
  dueOn: string;
  completedAt: string | null;
};
function branch(scope: Scope, id: string) {
  if (!scope.authorizedBranchIds.includes(id))
    throw new BusinessError(
      "NOT_FOUND",
      "Enquiry unavailable in your branch scope.",
    );
}
const fields = `e.id,e.branch_id as "branchId",b.name as "branchName",e.name,e.email,e.phone,e.interest,e.contact_allowed as "contactAllowed",e.stage,e.trial_at as "trialAt",e.assignee_id as "assigneeId",u.name as "assigneeName",e.converted_member_id as "convertedMemberId",e.version`;
const joins = `gym.enquiries e join gym.branches b on b.organization_id=e.organization_id and b.id=e.branch_id left join gym.staff_memberships a on a.organization_id=e.organization_id and a.id=e.assignee_id left join app_auth."user" u on u.id=a.auth_user_id`;
export function createEnquiriesService(
  security: ReturnType<typeof createSecurity>,
) {
  async function get(headers: Headers, raw: unknown) {
    const q = parse(enquiryQuery, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId, branchId: q.branchId },
      "enquiries.manage",
      async (db, s, _user, ctx) => {
        const search = "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%",
          today = todayInZone(ctx.organization.time_zone);
        const result = (
          await db.query(
            `with filtered as materialized(select ${fields} from ${joins} where e.organization_id=$1 and e.branch_id=any($2::uuid[]) and ($3::text is null or e.stage=$3) and (e.name ilike $4 or e.email ilike $4 or e.phone ilike $4 or e.interest ilike $4)),
    bounds as(select count(*)::int total,greatest(1,least($5::int,greatest(1,ceil(count(*)/25.0)::int))) page from filtered),
    tasks as materialized(select t.id,t.enquiry_id as "enquiryId",e.name,t.action,t.due_on::text as "dueOn",t.completed_at as "completedAt" from gym.follow_up_tasks t join filtered e on e.id=t.enquiry_id where t.organization_id=$1 and t.branch_id=any($2::uuid[]) and ($6::uuid is null or t.enquiry_id=$6) and ($7='all' or ($7='open' and t.completed_at is null) or ($7='done' and t.completed_at is not null))),
    task_bounds as(select count(*)::int total,greatest(1,least($8::int,greatest(1,ceil(count(*)/25.0)::int))) page from tasks)
    select (select total from bounds) total,(select page from bounds) page,
    coalesce((select jsonb_agg(x order by name,id) from(select * from filtered order by name,id limit 25 offset((select page from bounds)-1)*25)x),'[]'::jsonb) rows,
    coalesce((select jsonb_object_agg(stage,n) from(select stage,count(*) n from filtered group by stage)x),'{}'::jsonb) counts,
    (select total from task_bounds) as "taskTotal",(select page from task_bounds) as "taskPage",
    coalesce((select jsonb_agg(x order by "dueOn",id) from(select * from tasks order by "dueOn",id limit 25 offset((select page from task_bounds)-1)*25)x),'[]'::jsonb) tasks,
    (select count(*)::int from tasks where "completedAt" is null and "dueOn"<=$9) as "dueTasks"`,
            [
              s.organizationId,
              [...s.branchIds],
              q.stage ?? null,
              search,
              q.page,
              q.selectedId ?? null,
              q.taskStatus,
              q.taskPage,
              today,
            ],
          )
        ).rows[0];
        let selected: Enquiry | null = null,
          history: { action: string; reason: string; at: string }[] = [];
        if (q.selectedId) {
          selected = (
            await db.query(
              `select ${fields} from ${joins} where e.organization_id=$1 and e.id=$2 and e.branch_id=any($3::uuid[])`,
              [s.organizationId, q.selectedId, [...s.branchIds]],
            )
          ).rows[0];
          if (!selected)
            throw new BusinessError("NOT_FOUND", "Enquiry not found.");
          history = (
            await db.query(
              `select action,reason,occurred_at::text as at from gym.audit_events where organization_id=$1 and entity_id=$2 and action like 'enquiry.%' order by occurred_at desc,id desc limit 50`,
              [s.organizationId, selected.id],
            )
          ).rows;
        }
        const staff = (
          await db.query(
            `select s.id,u.name,array_agg(g.branch_id) as "branchIds" from gym.staff_memberships s join app_auth."user" u on u.id=s.auth_user_id join gym.staff_branch_grants g on g.organization_id=s.organization_id and g.staff_membership_id=s.id where s.organization_id=$1 and s.active and s.role in ('owner','manager','receptionist') and g.branch_id=any($2::uuid[]) group by s.id,u.name order by u.name,s.id limit 200`,
            [s.organizationId, [...s.branchIds]],
          )
        ).rows as { id: string; name: string; branchIds: string[] }[];
        const plans = (
          await db.query(
            `select v.id,p.branch_id as "branchId",v.name,v.amount_minor::text as "amountMinor",v.currency,v.duration_unit as "durationUnit",v.duration_count as "durationCount" from gym.plans p join lateral(select * from gym.plan_versions where organization_id=p.organization_id and plan_id=p.id order by version desc limit 1) v on true where p.organization_id=$1 and p.branch_id=any($2::uuid[]) and p.archived_at is null order by v.name,p.id limit 200`,
            [s.organizationId, [...s.branchIds]],
          )
        ).rows as {
          id: string;
          branchId: string;
          name: string;
          amountMinor: string;
          currency: string;
          durationUnit: "days" | "months";
          durationCount: number;
        }[];
        return {
          organization: {
            id: s.organizationId,
            name: ctx.organization.name,
            timeZone: ctx.organization.time_zone,
            today,
          },
          branches: ctx.branches,
          query: { ...q, page: result.page, taskPage: result.taskPage },
          rows: result.rows as Enquiry[],
          total: result.total as number,
          counts: result.counts as Record<string, number>,
          tasks: result.tasks as FollowUp[],
          taskTotal: result.taskTotal as number,
          dueTasks: result.dueTasks as number,
          selected,
          history,
          staff,
          plans,
          canManageSettings: can(s.role, "settings.manage"),
          canManageFees: can(s.role, "fees.manage"),
          canReadPlans: can(s.role, "plans.read"),
          requestId: s.requestId,
        };
      },
    );
  }
  async function post(headers: Headers, raw: unknown) {
    const v = parse(enquiryMutation, raw);
    return security.run(
      headers,
      { organizationId: v.organizationId },
      "enquiries.manage",
      async (db, s, _user, ctx) => {
        await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `schedule-request:${s.organizationId}:${s.userId}:${v.requestKey}`,
        ]);
        const hash = createHash("sha256")
          .update(JSON.stringify({ module: "enquiries", ...v }))
          .digest("hex");
        const prior = (
          await db.query(
            "select request_hash,branch_ids,result from gym.schedule_requests where organization_id=$1 and actor_id=$2 and request_key=$3",
            [s.organizationId, s.userId, v.requestKey],
          )
        ).rows[0];
        if (prior) {
          prior.branch_ids.forEach((id: string) => branch(s, id));
          if (prior.request_hash !== hash)
            throw new BusinessError(
              "CONFLICT",
              "This request already saved different details. Reload before another change.",
            );
          return { ...prior.result, requestId: s.requestId, replayed: true };
        }
        const before =
          v.operation === "create"
            ? null
            : (
                await db.query(
                  "select * from gym.enquiries where organization_id=$1 and id=$2 and branch_id=any($3::uuid[]) for update",
                  [s.organizationId, v.id, [...s.branchIds]],
                )
              ).rows[0];
        if (v.operation !== "create" && !before)
          throw new BusinessError("NOT_FOUND", "Enquiry not found.");
        const branchId =
          v.operation === "create" ? v.branchId : before.branch_id;
        branch(s, branchId);
        let memberId: string | null = before?.converted_member_id ?? null,
          taskId: string | null = null;
        if (v.operation === "create" || v.operation === "edit") {
          if (before?.converted_member_id)
            throw new BusinessError(
              "CONFLICT",
              "This enquiry has joined. Edit the member profile for contact changes.",
            );
          if (v.stage === "trial_booked" && !v.trialAt)
            throw new BusinessError(
              "VALIDATION_ERROR",
              "Choose a trial date and time.",
            );
          if (v.trialAt) {
            const clock = (
              await db.query(
                "select ($1::text::timestamptz at time zone $2)=$1::text::timestamp valid",
                [v.trialAt, ctx.organization.time_zone],
              )
            ).rows[0];
            if (!clock.valid)
              throw new BusinessError(
                "VALIDATION_ERROR",
                "The trial UTC offset does not match the gym time zone on this date.",
              );
          }
          if (
            v.stage === "trial_booked" &&
            (!before ||
              before.trial_at?.toISOString() !==
                new Date(v.trialAt!).toISOString()) &&
            Date.parse(v.trialAt!) <= Date.now()
          )
            throw new BusinessError(
              "VALIDATION_ERROR",
              "New trial times must be in the future.",
            );
          if (v.assigneeId) {
            const assigned = (
              await db.query(
                `select id from gym.staff_memberships s where s.organization_id=$1 and s.id=$2 and s.active and s.role in ('owner','manager','receptionist') and exists(select 1 from gym.staff_branch_grants g where g.organization_id=s.organization_id and g.staff_membership_id=s.id and g.branch_id=$3) for share`,
                [s.organizationId, v.assigneeId, branchId],
              )
            ).rows[0];
            if (!assigned)
              throw new BusinessError(
                "NOT_FOUND",
                "Choose active staff in this branch.",
              );
          }
          if (v.operation === "create")
            await db.query(
              "insert into gym.enquiries(id,organization_id,branch_id,name,email,phone,interest,contact_allowed,stage,trial_at,assignee_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
              [
                v.id,
                s.organizationId,
                branchId,
                v.name,
                v.email.toLowerCase(),
                v.phone,
                v.interest,
                v.contactAllowed,
                v.stage,
                v.trialAt,
                v.assigneeId,
              ],
            );
          else {
            if (before.version !== v.version)
              throw new BusinessError(
                "CONFLICT",
                "This enquiry changed. Reload before editing.",
              );
            await db.query(
              "update gym.enquiries set name=$3,email=$4,phone=$5,interest=$6,contact_allowed=$7,stage=$8,trial_at=$9,assignee_id=$10,version=version+1 where organization_id=$1 and id=$2",
              [
                s.organizationId,
                v.id,
                v.name,
                v.email.toLowerCase(),
                v.phone,
                v.interest,
                v.contactAllowed,
                v.stage,
                v.trialAt,
                v.assigneeId,
              ],
            );
          }
        } else if (v.operation === "task") {
          taskId = randomUUID();
          await db.query(
            "insert into gym.follow_up_tasks(id,organization_id,branch_id,enquiry_id,action,due_on) values($1,$2,$3,$4,$5,$6)",
            [taskId, s.organizationId, branchId, v.id, v.action, v.dueOn],
          );
        } else if (v.operation === "complete_task") {
          const saved = await db.query(
            "update gym.follow_up_tasks set completed_at=clock_timestamp(),completed_by=$4 where organization_id=$1 and enquiry_id=$2 and id=$3 and completed_at is null returning id",
            [s.organizationId, v.id, v.taskId, s.membershipId],
          );
          if (!saved.rowCount)
            throw new BusinessError(
              "CONFLICT",
              "This task was already completed or is unavailable. Reload to review.",
            );
          taskId = v.taskId;
        } else {
          if (before.converted_member_id)
            throw new BusinessError(
              "CONFLICT",
              "This enquiry already has a member. Open the linked profile.",
            );
          if (before.version !== v.version)
            throw new BusinessError(
              "CONFLICT",
              "This enquiry changed. Reload before converting.",
            );
          if (before.stage === "lost")
            throw new BusinessError(
              "CONFLICT",
              "Reopen this enquiry before converting it.",
            );
          const input = parse(createMember, {
            organizationId: s.organizationId,
            registrationKey: v.requestKey,
            name: before.name,
            email: before.email,
            phone: before.phone,
            homeBranchId: branchId,
            joinedOn: v.joinedOn,
            acknowledgeDuplicate: !!v.sharedContactReason,
            duplicateReason: v.sharedContactReason,
          });
          const saved = await registerMemberInTransaction(db, s, input);
          memberId = saved.member.id;
          if (v.enrollment.mode === "enroll")
            await enrollMemberInTransaction(db, s, saved.member, {
              organizationId: s.organizationId,
              memberVersion: saved.member.version,
              mode: "enroll",
              planVersionId: v.enrollment.planVersionId,
              startOn: v.enrollment.startOn,
              requestKey: v.requestKey,
              reason: v.reason,
            });
          await db.query(
            "update gym.enquiries set stage='joined',converted_member_id=$3,version=version+1 where organization_id=$1 and id=$2",
            [s.organizationId, v.id, memberId],
          );
        }
        const after = (
          await db.query(
            "select * from gym.enquiries where organization_id=$1 and id=$2",
            [s.organizationId, v.id],
          )
        ).rows[0];
        const result = { id: v.id, version: after.version, memberId, taskId };
        await audit(db, s, "enquiry." + v.operation, v.id, v.reason, before, {
          ...after,
          taskId,
          task:
            v.operation === "task"
              ? { action: v.action, dueOn: v.dueOn }
              : undefined,
        });
        await db.query(
          "insert into gym.schedule_requests(organization_id,actor_id,request_key,request_hash,operation,branch_ids,result) values($1,$2,$3,$4,$5,$6::uuid[],$7::jsonb)",
          [
            s.organizationId,
            s.userId,
            v.requestKey,
            hash,
            "enquiry." + v.operation,
            [branchId],
            JSON.stringify(result),
          ],
        );
        return { ...result, requestId: s.requestId, replayed: false };
      },
    );
  }
  return { get, post };
}
export type EnquiriesData = Awaited<
  ReturnType<ReturnType<typeof createEnquiriesService>["get"]>
>;
