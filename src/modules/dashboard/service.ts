import "server-only";
import type { createSecurity } from "@/server/security/service";
import { selectionSchema } from "@/server/security/service";
import { can } from "@/server/security/permissions";
import { parse } from "@/modules/members/service";
import type { DashboardData } from "./types";

export function createDashboardService(
  security: ReturnType<typeof createSecurity>,
) {
  async function get(headers: Headers, raw: unknown): Promise<DashboardData> {
    const selection = parse(selectionSchema, raw);
    return security.run(
      headers,
      selection,
      "dashboard.read",
      async (db, scope) => {
        const operational = can(scope.role, "attendance.manage");
        const financial = can(scope.role, "reports.financial");
        // One statement keeps counts, lists and financial summaries on one snapshot.
        // Money stays numeric in SQL and decimal minor-unit text across the boundary.
        const result = (
          await db.query(
            `
        with org as (
          select id,name,locale,time_zone as zone,(statement_timestamp() at time zone time_zone)::date today
          from gym.organizations where id=$1
        ), calendar as (
          select *,case when $4::boolean then date_trunc('month',today)::date else today end cash_from from org
        ), effective as (
          select p.*,m.name,m.member_code from gym.memberships p
          join gym.members m on m.organization_id=p.organization_id and m.id=p.member_id
          cross join calendar c
          where $3::boolean and p.organization_id=$1 and p.home_branch_id=any($2::uuid[])
          and m.archived_at is null and p.activated_at is not null and p.start_on<=c.today
          and p.end_on_exclusive>c.today and (p.cancelled_effective_on is null or p.cancelled_effective_on>c.today)
          and not exists(select 1 from gym.membership_freezes f where f.organization_id=p.organization_id and f.membership_id=p.id and f.reversed_at is null and f.start_on<=c.today and f.end_on_exclusive>c.today)
        ), cash as (
          select p.currency,p.amount_minor::numeric received,0::numeric refunded from gym.payments p cross join calendar c
          where p.organization_id=$1 and p.originating_branch_id=any($2::uuid[]) and p.paid_on between c.cash_from and c.today
          union all
          select r.currency,0::numeric,r.amount_minor::numeric from gym.financial_corrections r cross join calendar c
          where r.organization_id=$1 and r.originating_branch_id=any($2::uuid[]) and r.kind in ('refund','refund_credit') and r.cash_on between c.cash_from and c.today
        ), balances as (
          select i.currency,i.due_on,b.balance_minor from gym.invoices i
          join gym.invoice_balances b on b.organization_id=i.organization_id and b.invoice_id=i.id
          where i.organization_id=$1 and i.originating_branch_id=any($2::uuid[]) and i.status='issued' and b.balance_minor>0
        ), week_visits as (
          select (v.checked_in_at at time zone c.zone)::date as visit_date,count(*)::int visits
          from gym.attendance_visits v cross join calendar c
          where $3::boolean and v.organization_id=$1 and v.branch_id=any($2::uuid[])
          and v.checked_in_at>=((c.today-6)::timestamp at time zone c.zone) and v.checked_in_at<((c.today+1)::timestamp at time zone c.zone)
          group by 1
        )
        select jsonb_build_object('id',c.id,'name',c.name,'locale',c.locale,'timeZone',c.zone) organization,
        c.today::text today,
        case when $3::boolean then jsonb_build_object(
          'activeMembers',(select count(distinct member_id)::int from effective),
          'checkIns',coalesce((select visits from week_visits where visit_date=c.today),0),
          'inside',(select count(*)::int from gym.attendance_visits v where v.organization_id=$1 and v.branch_id=any($2::uuid[]) and v.checked_out_at is null),
          'stale',(select count(*)::int from gym.attendance_visits v where v.organization_id=$1 and v.branch_id=any($2::uuid[]) and v.checked_out_at is null and v.checked_in_at<(c.today::timestamp at time zone c.zone)),
          'week',(select jsonb_agg(jsonb_build_object('day',(c.today-6+d.n)::text,'visits',coalesce(w.visits,0)) order by d.n) from generate_series(0,6) d(n) left join week_visits w on w.visit_date=c.today-6+d.n),
          'recentMembers',coalesce((select jsonb_agg(r) from (select m.id,m.name,m.member_code as "memberCode",m.joined_on::text as "joinedOn" from gym.members m where m.organization_id=$1 and m.home_branch_id=any($2::uuid[]) and m.archived_at is null order by m.created_at desc,m.id desc limit 6) r),'[]'::jsonb),
          'renewals',coalesce((select jsonb_agg(r) from (select * from (select distinct on(e.member_id) e.member_id id,e.name,e.member_code as "memberCode",e.end_on_exclusive::text as "renewOn" from effective e where e.end_on_exclusive<=c.today+14 and not exists(select 1 from gym.memberships next where next.organization_id=e.organization_id and next.member_id=e.member_id and next.start_on=e.end_on_exclusive and (next.cancelled_effective_on is null or next.cancelled_effective_on>next.start_on)) order by e.member_id,e.end_on_exclusive) selected order by "renewOn",id limit 8) r),'[]'::jsonb)
        ) else null end operational,
        jsonb_build_object(
          'period',case when $4::boolean then 'month' else 'today' end,
          'fromOn',c.cash_from::text,
          'collections',coalesce((select jsonb_agg(r) from (select currency,sum(received)::text as "receivedMinor",sum(refunded)::text as "refundedMinor",(sum(received)-sum(refunded))::text as "netMinor" from cash group by currency order by currency) r),'[]'::jsonb),
          'overdueCount',(select count(*)::int from balances where due_on<c.today),
          'outstanding',case when $4::boolean then coalesce((select jsonb_agg(r) from (select currency,sum(balance_minor)::text as "amountMinor" from balances group by currency order by currency) r),'[]'::jsonb) else null end
        ) finance,
        (select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name,b.id) from gym.branches b where b.organization_id=$1 and b.id=any($5::uuid[])) branches
        from calendar c`,
            [
              scope.organizationId,
              [...scope.branchIds],
              operational,
              financial,
              [...scope.authorizedBranchIds],
            ],
          )
        ).rows[0];
        return {
          ...result,
          branchId: selection.branchId ?? "",
          canManageSettings: can(scope.role, "settings.read"),
          canManageMembers: can(scope.role, "members.manage"),
          canReadPlans: can(scope.role, "plans.read"),
          canReadBilling: can(scope.role, "billing.read"),
          requestId: scope.requestId,
        };
      },
    );
  }
  return { get };
}
