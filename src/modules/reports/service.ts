import "server-only";
import { z } from "zod";
import { getSecurity } from "@/server/security";
import { parse } from "@/modules/members/service";
import { calendarDate } from "@/modules/memberships/schemas";
import { fractionDigits, todayInZone } from "@/modules/plans/format";
import { daysBetween } from "@/modules/memberships/state";
import { BusinessError } from "@/server/errors";

export const reportQuery = z
  .object({
    organizationId: z.uuid().optional(),
    branchId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.uuid().optional(),
    ),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    report: z
      .enum(["collections", "memberships", "attendance"])
      .default("collections"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
const money = (field: string) => `(${field})::text`;
export function createReportsService(security: ReturnType<typeof getSecurity>) {
  return async function getReport(
    headers: Headers,
    raw: unknown,
    exporting = false,
  ) {
    const q = parse(reportQuery, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId, branchId: q.branchId },
      "reports.financial",
      async (db, s, _user, ctx) => {
        const today = todayInZone(ctx.organization.time_zone),
          from = q.from ?? today.slice(0, 7) + "-01",
          to = q.to ?? today;
        if (from > to || to > today || daysBetween(from, to) > 366)
          throw new BusinessError(
            "VALIDATION_ERROR",
            "Choose a current or past range of at most 367 days.",
          );
        const source =
          q.report === "collections"
            ? `
   select p.id,p.paid_on as cash_date,p.originating_branch_id branch_id,p.receipt_number reference,p.currency,'Payment' kind,p.amount_minor::numeric received,0::numeric refunded,0::numeric expense,0::numeric reversal from gym.payments p where p.organization_id=$1 and p.originating_branch_id=any($2::uuid[]) and p.paid_on between $3::date and $4::date
   union all select r.id,r.cash_on,r.originating_branch_id,r.number,r.currency,'Refund',0,r.amount_minor,0,0 from gym.financial_corrections r where r.organization_id=$1 and r.originating_branch_id=any($2::uuid[]) and r.kind in ('refund','refund_credit') and r.cash_on between $3::date and $4::date
   union all select e.id,e.paid_on,e.branch_id,e.number,e.currency,'Expense',0,0,e.amount_minor,0 from gym.expenses e where e.organization_id=$1 and e.branch_id=any($2::uuid[]) and e.paid_on between $3::date and $4::date
   union all select r.id,r.cash_on,r.branch_id,e.number,r.currency,'Expense reversal',0,0,0,r.amount_minor from gym.expense_reversals r join gym.expenses e on e.organization_id=r.organization_id and e.id=r.expense_id where r.organization_id=$1 and r.branch_id=any($2::uuid[]) and r.cash_on between $3::date and $4::date
  `
            : q.report === "attendance"
              ? `
   select v.*,m.name,m.member_code from gym.attendance_visits v join gym.members m on m.organization_id=v.organization_id and m.id=v.member_id where v.organization_id=$1 and v.branch_id=any($2::uuid[]) and v.checked_in_at>=($3::date::timestamp at time zone $5) and v.checked_in_at<(($4::date+1)::timestamp at time zone $5)
  `
              : `
   select p.*,m.name,m.member_code,m.archived_at,least(p.end_on_exclusive,coalesce(p.cancelled_effective_on,p.end_on_exclusive)) effective_end from gym.memberships p join gym.members m on m.organization_id=p.organization_id and m.id=p.member_id where p.organization_id=$1 and p.home_branch_id=any($2::uuid[])
  `;
        const rowSql =
          q.report === "collections"
            ? `select r.id,r.cash_date::text sort,array[r.cash_date::text,b.name,r.kind,r.reference,r.currency,${money("received")},${money("refunded")},${money("expense")},${money("reversal")},${money("received-refunded-expense+reversal")}] vals from source r join gym.branches b on b.organization_id=$1 and b.id=r.branch_id`
            : q.report === "attendance"
              ? `select r.id,r.checked_in_at::text sort,array[r.name,r.member_code,b.name,to_char(r.checked_in_at at time zone $5,'YYYY-MM-DD HH24:MI:SS'),coalesce(to_char(r.checked_out_at at time zone $5,'YYYY-MM-DD HH24:MI:SS'),'Open'),case when r.checked_out_at is null then '' else round(extract(epoch from(r.checked_out_at-r.checked_in_at))/60,2)::text end,case when r.override_actor_id is null then 'Allowed' else 'Override' end] vals from source r join gym.branches b on b.organization_id=$1 and b.id=r.branch_id`
              : `select r.id,r.start_on::text sort,array[r.name,r.member_code,b.name,r.snapshot->>'name',r.start_on::text,r.effective_end::text,case when r.cancelled_effective_on<=$4::date then 'Cancelled' when r.effective_end<=$4::date then 'Expired' when r.activated_at is null then 'Pending activation' when r.start_on>$4::date then 'Upcoming' when exists(select 1 from gym.membership_freezes f where f.organization_id=$1 and f.membership_id=r.id and f.reversed_at is null and f.start_on<=$4::date and f.end_on_exclusive>$4::date) then 'Frozen' else 'Active' end,r.currency,${money("r.amount_minor")}] vals from source r join gym.branches b on b.organization_id=$1 and b.id=r.home_branch_id where r.start_on<=$4::date and r.effective_end>$3::date`;
        const summarySql =
          q.report === "collections"
            ? `select currency,sum(received)::text received,sum(refunded)::text refunded,sum(expense)::text expenses,sum(reversal)::text reversals,sum(received-refunded)::text as "netCollections",sum(expense-reversal)::text as "netExpenses",sum(received-refunded-expense+reversal)::text as "netCash" from source group by currency`
            : q.report === "attendance"
              ? `select count(*)::text as "Check-ins",count(distinct member_id)::text as "Unique visitors",count(*) filter(where checked_out_at is null)::text as "Open visits",coalesce(round(avg(extract(epoch from(checked_out_at-checked_in_at))/60) filter(where checked_out_at is not null),2)::text,'N/A') as "Average closed visit minutes" from source`
              : `select count(distinct member_id) filter(where archived_at is null and activated_at is not null and start_on<=$4::date and effective_end>$4::date and not exists(select 1 from gym.membership_freezes f where f.organization_id=$1 and f.membership_id=source.id and f.reversed_at is null and f.start_on<=$4::date and f.end_on_exclusive>$4::date))::text as "Active members at period end",(select count(*)::text from cohort) as "Ended-member cohort",(select count(*)::text from cohort c where exists(select 1 from source n where n.member_id=c.member_id and n.start_on>=c.ended and n.start_on<=c.ended+7 and n.activated_at is not null and n.effective_end>n.start_on)) as "Renewed within seven days",(select count(*)::text from cohort where ended+7>$9::date) as "Cohort still under observation" from source`;
        const cohort =
          q.report === "memberships"
            ? `cohort as(select member_id,max(effective_end) ended from source where activated_at is not null and effective_end>start_on and effective_end between $3::date and $4::date group by member_id),`
            : "";
        const result = (
          await db.query(
            `with source as materialized(${source}),${cohort}records as materialized(${rowSql}), bounds as(select count(*)::int total,greatest(1,least($6::int,greatest(1,ceil(count(*)/50.0)::int))) page from records)
    select statement_timestamp()::text generated,(select total from bounds) total,(select page from bounds) page,
    coalesce((select jsonb_agg(jsonb_build_object('id',id,'values',vals) order by sort desc,id) from(select * from records order by sort desc,id limit $7 offset case when $8::boolean then 0 else ((select page from bounds)-1)*50 end)x),'[]'::jsonb) rows,
    coalesce((select jsonb_agg(x) from(${summarySql})x),'[]'::jsonb) summary,
    $5::text zone,$9::date today`,
            [
              s.organizationId,
              [...s.branchIds],
              from,
              to,
              ctx.organization.time_zone,
              q.page,
              exporting ? 10001 : 50,
              exporting,
              today,
            ],
          )
        ).rows[0];
        if (exporting && result.total > 10000)
          throw new BusinessError(
            "VALIDATION_ERROR",
            "Export exceeds 10,000 rows. Choose a shorter range or one branch.",
          );
        const headers =
          q.report === "collections"
            ? [
                "Date",
                "Branch",
                "Type",
                "Reference",
                "Currency",
                "Received",
                "Refunded",
                "Expenses",
                "Reversals",
                "Net cash flow",
              ]
            : q.report === "attendance"
              ? [
                  "Member",
                  "Code",
                  "Visit branch",
                  "Check-in (gym local)",
                  "Checkout (gym local)",
                  "Minutes",
                  "Admission",
                ]
              : [
                  "Member",
                  "Code",
                  "Home branch",
                  "Plan",
                  "Start",
                  "End (exclusive)",
                  "Status at period end",
                  "Currency",
                  "Fee",
                ];
        for (const row of result.rows as { values: string[] }[]) {
          const currencyIndex = q.report === "collections" ? 4 : 7;
          if (q.report === "attendance") continue;
          const digits = fractionDigits(row.values[currencyIndex]);
          const scale = 10n ** BigInt(digits);
          const indexes = q.report === "collections" ? [5, 6, 7, 8, 9] : [8];
          for (const index of indexes) {
            const value = BigInt(row.values[index]),
              absolute = value < 0n ? -value : value;
            row.values[index] =
              (value < 0n ? "-" : "") +
              (absolute / scale).toString() +
              (digits
                ? "." + (absolute % scale).toString().padStart(digits, "0")
                : "");
          }
        }
        if (q.report === "memberships") {
          const summary = result.summary[0];
          const denominator = Number(summary["Ended-member cohort"]);
          summary["Renewal rate"] = denominator
            ? (
                (100 * Number(summary["Renewed within seven days"])) /
                denominator
              ).toFixed(1) + "%"
            : "N/A";
          summary["Observation"] =
            summary["Cohort still under observation"] !== "0"
              ? "Provisional"
              : "Complete";
        }
        return {
          organization: {
            id: s.organizationId,
            name: ctx.organization.name,
            timeZone: ctx.organization.time_zone,
          },
          branches: ctx.branches,
          query: {
            ...q,
            organizationId: s.organizationId,
            from,
            to,
            page: result.page,
          },
          headers,
          rows: result.rows as { id: string; values: string[] }[],
          summary: result.summary as Record<string, string>[],
          total: result.total as number,
          page: result.page as number,
          generatedAt: result.generated as string,
          canManageSettings: s.role === "owner" || s.role === "manager",
          canManageMembers: s.role !== "accountant",
          requestId: s.requestId,
        };
      },
    );
  };
}
export const getReport = (
  ...args: Parameters<ReturnType<typeof createReportsService>>
) => createReportsService(getSecurity())(...args);

export type ReportsData = Awaited<ReturnType<typeof getReport>>;
