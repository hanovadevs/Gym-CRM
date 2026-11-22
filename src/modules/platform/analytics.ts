import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import { calendarDate } from "@/modules/memberships/schemas";
import { daysBetween } from "@/modules/memberships/state";
import { parse } from "@/modules/members/service";
import { BusinessError } from "@/server/errors";

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
const query = z
  .object({
    organizationId: z.uuid(),
    branchId: optional(z.uuid()),
    from: optional(calendarDate),
    to: optional(calendarDate),
  })
  .strict();
export type GymAnalytics = {
  organization: {
    id: string;
    name: string;
    active: boolean;
    timeZone: string;
    locale: string;
    currency: string;
  };
  from: string;
  to: string;
  today: string;
  branchId: string;
  generatedAt: string;
  branches: { id: string; name: string; active: boolean }[];
  members: {
    total: number;
    registered: number;
    archived: number;
    newRegistrations: number;
    currentTerms: number;
    renewals: number;
  };
  attendance: {
    visits: number;
    uniqueVisitors: number;
    inside: number;
    averageSeconds: number | null;
  };
  administration: {
    activeStaff: number;
    activeBranches: number;
    draftInvoices: number;
  };
  finances: {
    currency: string;
    receivedMinor: string;
    refundedMinor: string;
    netCollectedMinor: string;
    postedExpenseMinor: string;
    reversedExpenseMinor: string;
    netExpenseMinor: string;
    netCashMinor: string;
    outstandingMinor: string;
    overdueMinor: string;
    invoicedMinor: string;
  }[];
  daily: { day: string; visits: number; registrations: number }[];
};
/** Called only inside the platform administrator authorization transaction. No identities or notes returned. */
export async function readGymAnalytics(
  db: PoolClient,
  raw: unknown,
): Promise<GymAnalytics> {
  const q = parse(query, raw);
  await db.query("select set_config('app.organization_id',$1,true)", [
    q.organizationId,
  ]);
  const org = (
    await db.query(
      `select id,name,active,time_zone as "timeZone",locale,currency,(statement_timestamp() at time zone time_zone)::date::text today from gym.organizations where id=$1 for share`,
      [q.organizationId],
    )
  ).rows[0];
  if (!org) throw new BusinessError("NOT_FOUND", "Gym not found.");
  const from = q.from ?? org.today.slice(0, 7) + "-01",
    to = q.to ?? org.today;
  if (from > to || to > org.today || daysBetween(from, to) > 365)
    throw new BusinessError(
      "VALIDATION_ERROR",
      "Choose a range of up to 366 days, ending today or earlier.",
    );
  const data = (
    await db.query(
      `
    with bounds as(select $2::date first_on,$3::date last_on,$4::text zone,$5::uuid branch_id,$6::date today),
    selected_branches as(select b.id,b.name,b.active from gym.branches b cross join bounds c where b.organization_id=$1 and (c.branch_id is null or b.id=c.branch_id)),
    selected_members as(select m.id,m.organization_id,m.archived_at,m.created_at from gym.members m where m.organization_id=$1 and m.home_branch_id in(select id from selected_branches)),
    effective as(select p.organization_id,p.member_id,p.end_on_exclusive from gym.memberships p join gym.members m on m.organization_id=p.organization_id and m.id=p.member_id cross join bounds c
      where p.organization_id=$1 and p.home_branch_id in(select id from selected_branches) and m.archived_at is null and p.activated_at is not null and p.start_on<=c.today and p.end_on_exclusive>c.today
      and (p.cancelled_effective_on is null or p.cancelled_effective_on>c.today)
      and not exists(select 1 from gym.membership_freezes f where f.organization_id=p.organization_id and f.membership_id=p.id and f.reversed_at is null and f.start_on<=c.today and f.end_on_exclusive>c.today)),
    registrations as(select m.created_at from selected_members m cross join bounds c where m.created_at>=(c.first_on::timestamp at time zone c.zone) and m.created_at<((c.last_on+1)::timestamp at time zone c.zone)),
    visits as(select v.member_id,v.checked_in_at,v.checked_out_at from gym.attendance_visits v cross join bounds c where v.organization_id=$1 and v.branch_id in(select id from selected_branches)
      and v.checked_in_at>=(c.first_on::timestamp at time zone c.zone) and v.checked_in_at<((c.last_on+1)::timestamp at time zone c.zone)),
    daily_visits as(select (v.checked_in_at at time zone c.zone)::date calendar_on,count(*)::int visits from visits v cross join bounds c group by 1),
    daily_registrations as(select (r.created_at at time zone c.zone)::date calendar_on,count(*)::int registrations from registrations r cross join bounds c group by 1),
    postings as(
      select p.currency,p.amount_minor::numeric received,0::numeric refunded,0::numeric expense,0::numeric reversal from gym.payments p cross join bounds c where p.organization_id=$1 and p.originating_branch_id in(select id from selected_branches) and p.paid_on between c.first_on and c.last_on
      union all select r.currency,0,r.amount_minor,0,0 from gym.financial_corrections r cross join bounds c where r.organization_id=$1 and r.originating_branch_id in(select id from selected_branches) and r.kind in('refund','refund_credit') and r.cash_on between c.first_on and c.last_on
      union all select e.currency,0,0,e.amount_minor,0 from gym.expenses e cross join bounds c where e.organization_id=$1 and e.branch_id in(select id from selected_branches) and e.paid_on between c.first_on and c.last_on
      union all select r.currency,0,0,0,r.amount_minor from gym.expense_reversals r cross join bounds c where r.organization_id=$1 and r.branch_id in(select id from selected_branches) and r.cash_on between c.first_on and c.last_on
    ),cash as(select currency,sum(received) received,sum(refunded) refunded,sum(expense) expense,sum(reversal) reversal from postings group by currency),
    debt as(select i.currency,sum(b.balance_minor)::numeric outstanding,coalesce(sum(b.balance_minor) filter(where i.due_on<c.today),0)::numeric overdue from gym.invoices i join gym.invoice_balances b on b.organization_id=i.organization_id and b.invoice_id=i.id cross join bounds c where i.organization_id=$1 and i.originating_branch_id in(select id from selected_branches) and i.status='issued' and b.balance_minor>0 group by i.currency),
    charges as(select i.currency,sum(i.total_minor)::numeric invoiced from gym.invoices i cross join bounds c where i.organization_id=$1 and i.originating_branch_id in(select id from selected_branches) and i.status='issued' and i.issued_on between c.first_on and c.last_on group by i.currency),
    currencies as(select currency from cash union select currency from debt union select currency from charges),
    finance as(select k.currency,coalesce(p.received,0)::text as "receivedMinor",coalesce(p.refunded,0)::text as "refundedMinor",(coalesce(p.received,0)-coalesce(p.refunded,0))::text as "netCollectedMinor",coalesce(p.expense,0)::text as "postedExpenseMinor",coalesce(p.reversal,0)::text as "reversedExpenseMinor",(coalesce(p.expense,0)-coalesce(p.reversal,0))::text as "netExpenseMinor",(coalesce(p.received,0)-coalesce(p.refunded,0)-coalesce(p.expense,0)+coalesce(p.reversal,0))::text as "netCashMinor",coalesce(d.outstanding,0)::text as "outstandingMinor",coalesce(d.overdue,0)::text as "overdueMinor",coalesce(ch.invoiced,0)::text as "invoicedMinor" from currencies k left join cash p using(currency) left join debt d using(currency) left join charges ch using(currency))
    select
      (select coalesce(jsonb_agg(b order by b.name,b.id),'[]'::jsonb) from(select id,name,active from gym.branches where organization_id=$1 order by name,id limit 100)b) branches,
      exists(select 1 from selected_branches) as "branchExists",
      jsonb_build_object('total',(select count(*)::int from selected_members),'registered',(select count(*)::int from selected_members where archived_at is null),'archived',(select count(*)::int from selected_members where archived_at is not null),'newRegistrations',(select count(*)::int from registrations),'currentTerms',(select count(distinct member_id)::int from effective),'renewals',(select count(distinct e.member_id)::int from effective e cross join bounds c where e.end_on_exclusive<=c.today+14 and not exists(select 1 from gym.memberships n where n.organization_id=e.organization_id and n.member_id=e.member_id and n.start_on=e.end_on_exclusive and (n.cancelled_effective_on is null or n.cancelled_effective_on>n.start_on)))) members,
      jsonb_build_object('visits',(select count(*)::int from visits),'uniqueVisitors',(select count(distinct member_id)::int from visits),'inside',(select count(*)::int from gym.attendance_visits where organization_id=$1 and branch_id in(select id from selected_branches) and checked_out_at is null),'averageSeconds',(select round(avg(extract(epoch from checked_out_at-checked_in_at)))::int from visits where checked_out_at is not null)) attendance,
      jsonb_build_object('activeStaff',(select count(*)::int from gym.staff_memberships s where s.organization_id=$1 and s.active and ($5::uuid is null or s.role='owner' or exists(select 1 from gym.staff_branch_grants g where g.organization_id=s.organization_id and g.staff_membership_id=s.id and g.branch_id=$5))),'activeBranches',(select count(*)::int from selected_branches where active),'draftInvoices',(select count(*)::int from gym.invoices where organization_id=$1 and originating_branch_id in(select id from selected_branches) and status='draft')) administration,
      coalesce((select jsonb_agg(f order by currency) from finance f),'[]'::jsonb) finances,
      (select jsonb_agg(jsonb_build_object('day',d.calendar_on::text,'visits',coalesce(v.visits,0),'registrations',coalesce(r.registrations,0)) order by d.calendar_on) from bounds c cross join lateral(select greatest(c.first_on,c.last_on-30)+n as calendar_on from generate_series(0,c.last_on-greatest(c.first_on,c.last_on-30)) n)d left join daily_visits v on v.calendar_on=d.calendar_on left join daily_registrations r on r.calendar_on=d.calendar_on) daily
    `,
      [q.organizationId, from, to, org.timeZone, q.branchId ?? null, org.today],
    )
  ).rows[0];
  if (q.branchId && !data.branchExists)
    throw new BusinessError("NOT_FOUND", "Branch not found in this gym.");
  return {
    organization: {
      id: org.id,
      name: org.name,
      active: org.active,
      timeZone: org.timeZone,
      locale: org.locale,
      currency: org.currency,
    },
    from,
    to,
    today: org.today,
    branchId: q.branchId ?? "",
    generatedAt: new Date().toISOString(),
    branches: data.branches,
    members: data.members,
    attendance: data.attendance,
    administration: data.administration,
    finances: data.finances,
    daily: data.daily,
  };
}
