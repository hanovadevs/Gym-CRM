import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { createSecurity, Scope } from "@/server/security/service";
import { can } from "@/server/security/permissions";
import { BusinessError } from "@/server/errors";
import { parse } from "@/modules/members/service";
import { audit } from "@/server/audit";
import { payrollMutation, payrollQuery } from "./schemas";
import type { PayrollData } from "./types";
const employeeColumns = `e.id,e.branch_id as "branchId",b.name as "branchName",e.trainer_id as "trainerId",e.name,e.title,e.phone,e.email,e.start_on::text as "startOn",e.active,e.salary_minor::text as "salaryMinor",e.currency,e.pay_day as "payDay",e.version`;
const chargeColumns = `c.id,c.employee_id as "employeeId",c.branch_id as "branchId",c.employee_name as "employeeName",c.employee_title as "employeeTitle",c.period::text,c.due_on::text as "dueOn",c.amount_minor::text as "amountMinor",c.currency,c.net_paid_minor::text as "paidMinor",c.balance_minor::text as "balanceMinor",c.voided_at is not null as voided,c.void_reason as "voidReason"`;
function branches(s: Scope, ids: string[]) {
  if (ids.some((id) => !s.authorizedBranchIds.includes(id)))
    throw new BusinessError(
      "NOT_FOUND",
      "Employee unavailable in your branch scope.",
    );
}
async function lock(db: PoolClient, key: string) {
  await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
}
export function createPayrollService(
  security: ReturnType<typeof createSecurity>,
) {
  async function get(headers: Headers, raw: unknown): Promise<PayrollData> {
    const q = parse(payrollQuery, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId, branchId: q.branchId },
      "payroll.manage",
      async (db, s, _identity, ctx) => {
        // One bounded statement gives the screen one financial snapshot without query waterfalls.
        const value = (
          await db.query(
            `
with candidates as materialized (
 select ${employeeColumns} from gym.employees e join gym.branches b on b.organization_id=e.organization_id and b.id=e.branch_id
 where e.organization_id=$1 and e.branch_id=any($2::uuid[]) and (e.name ilike $3 or e.title ilike $3)
), bounds as (select count(*)::int total,greatest(1,least($4::int,(count(*)::int+24)/25)) page from candidates),
chosen as (select ${employeeColumns} from gym.employees e join gym.branches b on b.organization_id=e.organization_id and b.id=e.branch_id
 where e.organization_id=$1 and e.branch_id=any($2::uuid[]) and e.id=coalesce($5::uuid,(select id from candidates order by active desc,name,id limit 1 offset(select(page-1)*25 from bounds)))),
charge_candidates as materialized (select ${chargeColumns},c.created_at sort_at from gym.payroll_balances c join chosen x on x.id=c.employee_id where c.organization_id=$1 and c.branch_id=any($2::uuid[])),
charge_bounds as (select count(*)::int total,greatest(1,least($7::int,(count(*)::int+24)/25)) page from charge_candidates),
chosen_charge as (select * from charge_candidates where $6::uuid is null or id=$6::uuid order by period desc,sort_at desc,id limit 1 offset case when $6::uuid is null then (select (page-1)*25 from charge_bounds) else 0 end),
payment_candidates as materialized (
 select p.id,e.id as "expenseId",e.number,e.amount_minor::text as "amountMinor",e.currency,e.paid_on::text as "paidOn",e.method,e.reference,r.id is not null as reversed,r.reason as "reversalReason",p.created_at sort_at
 from gym.payroll_payments p join gym.expenses e on e.organization_id=p.organization_id and e.id=p.expense_id left join gym.expense_reversals r on r.organization_id=e.organization_id and r.expense_id=e.id
 where p.organization_id=$1 and p.charge_id=(select id from chosen_charge)),
payment_bounds as (select count(*)::int total,greatest(1,least($8::int,(count(*)::int+24)/25)) page from payment_candidates)
select bounds.total,bounds.page,
 coalesce((select jsonb_agg(r) from(select * from candidates order by active desc,name,id limit 25 offset(select(page-1)*25 from bounds))r),'[]'::jsonb) rows,
 (select to_jsonb(x) from chosen x) selected,
 coalesce((select jsonb_agg(to_jsonb(r)-'sort_at') from(select * from charge_candidates order by period desc,sort_at desc,id limit 25 offset(select(page-1)*25 from charge_bounds))r),'[]'::jsonb) charges,
 (select total from charge_bounds) as "chargeTotal",(select page from charge_bounds) as "chargePage",
 (select to_jsonb(x)-'sort_at' from chosen_charge x) as "selectedCharge",
 coalesce((select jsonb_agg(to_jsonb(r)-'sort_at') from(select * from payment_candidates order by "paidOn" desc,sort_at desc,id limit 25 offset(select(page-1)*25 from payment_bounds))r),'[]'::jsonb) payments,
 (select total from payment_bounds) as "paymentTotal",(select page from payment_bounds) as "paymentPage",
 coalesce((select jsonb_agg(r) from(select currency,coalesce(sum(amount_minor) filter(where voided_at is null),0)::text as "chargedMinor",coalesce(sum(net_paid_minor),0)::text as "paidMinor",coalesce(sum(balance_minor),0)::text as "balanceMinor" from gym.payroll_balances where organization_id=$1 and branch_id=any($2::uuid[]) group by currency order by currency)r),'[]'::jsonb) summary,
 coalesce((select jsonb_agg(r) from(select t.id,t.name,array_agg(b.branch_id order by b.branch_id) as "branchIds" from gym.trainers t join gym.trainer_branches b on b.organization_id=t.organization_id and b.trainer_id=t.id and b.active where $9::boolean and t.organization_id=$1 and t.active and b.branch_id=any($10::uuid[]) group by t.id,t.name order by t.name,t.id limit 200)r),'[]'::jsonb) as "trainerOptions",
 (select jsonb_build_object('id',id,'name',name,'currency',currency,'locale',locale,'timeZone',time_zone,'today',(clock_timestamp() at time zone time_zone)::date::text) from gym.organizations where id=$1) organization
from bounds`,
            [
              s.organizationId,
              [...s.branchIds],
              "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%",
              q.page,
              q.employeeId ?? null,
              q.chargeId ?? null,
              q.chargePage,
              q.paymentPage,
              can(s.role, "employees.manage"),
              [...s.authorizedBranchIds],
            ],
          )
        ).rows[0];
        if (q.employeeId && !value.selected)
          throw new BusinessError(
            "NOT_FOUND",
            "Employee unavailable in this branch selection.",
          );
        if (q.chargeId && !value.selectedCharge)
          throw new BusinessError("NOT_FOUND", "Salary entry unavailable.");
        return {
          ...value,
          branches: ctx.branches,
          branchId: q.branchId ?? "",
          q: q.q,
          canManageEmployees: can(s.role, "employees.manage"),
          canManageSettings: can(s.role, "settings.read"),
          canManageMembers: can(s.role, "members.manage"),
          canReadPlans: can(s.role, "plans.read"),
          canReadBilling: can(s.role, "billing.read"),
          requestId: s.requestId,
        };
      },
    );
  }
  async function post(headers: Headers, raw: unknown) {
    const v = parse(payrollMutation, raw);
    try {
      return await security.run(
        headers,
        { organizationId: v.organizationId },
        v.operation === "employee" ? "employees.manage" : "payroll.manage",
        async (db, s) => {
          await lock(
            db,
            `payroll-request:${s.organizationId}:${s.userId}:${v.requestKey}`,
          );
          const hash = createHash("sha256")
              .update(JSON.stringify(v))
              .digest("hex"),
            prior = (
              await db.query(
                "select request_hash,branch_ids,result from gym.payroll_requests where organization_id=$1 and actor_id=$2 and request_key=$3",
                [s.organizationId, s.userId, v.requestKey],
              )
            ).rows[0];
          if (prior) {
            branches(s, prior.branch_ids);
            if (prior.request_hash !== hash)
              throw new BusinessError(
                "CONFLICT",
                "This saved request belongs to another payroll change.",
              );
            return { ...prior.result, requestId: s.requestId };
          }
          let result: Record<string, unknown>, affected: string[];
          const org = (
            await db.query(
              "select (clock_timestamp() at time zone time_zone)::date::text today from gym.organizations where id=$1",
              [s.organizationId],
            )
          ).rows[0];
          if (v.operation === "employee") {
            branches(s, [v.branchId]);
            await lock(db, `employee:${s.organizationId}:${v.id}`);
            const old = (
              await db.query(
                "select * from gym.employees where organization_id=$1 and id=$2 for update",
                [s.organizationId, v.id],
              )
            ).rows[0];
            affected = [
              ...new Set([v.branchId, ...(old ? [old.branch_id] : [])]),
            ];
            branches(s, affected);
            if ((old && old.version !== v.version) || (!old && v.version))
              throw new BusinessError(
                "CONFLICT",
                "Employee changed. Reload before editing.",
              );
            const values = [
              s.organizationId,
              v.id,
              v.branchId,
              v.trainerId,
              v.name,
              v.title,
              v.phone,
              v.email,
              v.startOn,
              v.active,
              v.salaryMinor,
              v.currency,
              v.payDay,
              s.userId,
            ];
            if (old)
              await db.query(
                "update gym.employees set branch_id=$3,trainer_id=$4,name=$5,title=$6,phone=$7,email=$8,start_on=$9,active=$10,salary_minor=$11,currency=$12,pay_day=$13,updated_by=$14,updated_at=clock_timestamp(),version=version+1 where organization_id=$1 and id=$2",
                values,
              );
            else
              await db.query(
                "insert into gym.employees(organization_id,id,branch_id,trainer_id,name,title,phone,email,start_on,active,salary_minor,currency,pay_day,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)",
                values,
              );
            result = { employeeId: v.id, version: old ? old.version + 1 : 1 };
            await audit(db, s, "employee.saved", v.id, v.reason, old ?? null, {
              ...v,
              requestKey: undefined,
            });
          } else if (v.operation === "charge") {
            const e = (
              await db.query(
                "select * from gym.employees where organization_id=$1 and id=$2 and branch_id=any($3::uuid[]) and active for share",
                [s.organizationId, v.employeeId, [...s.branchIds]],
              )
            ).rows[0];
            if (!e)
              throw new BusinessError(
                "NOT_FOUND",
                "Choose an active employee in your branch scope.",
              );
            if (v.currency !== e.currency)
              throw new BusinessError(
                "CONFLICT",
                "Employee salary currency changed. Reload and review.",
              );
            if (v.dueOn < v.period)
              throw new BusinessError(
                "VALIDATION_ERROR",
                "Due date cannot precede salary month.",
              );
            const c = (
              await db.query(
                "insert into gym.payroll_charges(organization_id,employee_id,branch_id,employee_name,employee_title,period,due_on,amount_minor,currency,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id",
                [
                  s.organizationId,
                  e.id,
                  e.branch_id,
                  e.name,
                  e.title,
                  v.period,
                  v.dueOn,
                  v.amountMinor,
                  v.currency,
                  s.userId,
                ],
              )
            ).rows[0];
            result = { employeeId: e.id, chargeId: c.id };
            affected = [e.branch_id];
            await audit(db, s, "payroll.charged", c.id, v.reason, null, {
              ...v,
              branchId: e.branch_id,
            });
          } else {
            await lock(db, `payroll-charge:${s.organizationId}:${v.chargeId}`);
            const c = (
              await db.query(
                "select *,period::text period_text,balance_minor::text balance from gym.payroll_balances where organization_id=$1 and id=$2 and branch_id=any($3::uuid[])",
                [s.organizationId, v.chargeId, [...s.branchIds]],
              )
            ).rows[0];
            if (!c)
              throw new BusinessError(
                "NOT_FOUND",
                "Payroll entry unavailable.",
              );
            if (c.voided_at)
              throw new BusinessError(
                "CONFLICT",
                "This salary entry was voided.",
              );
            affected = [c.branch_id];
            result = { employeeId: c.employee_id, chargeId: c.id };
            if (v.operation === "void") {
              if (BigInt(c.net_paid_minor) !== 0n)
                throw new BusinessError(
                  "CONFLICT",
                  "Reverse payments before voiding this salary entry.",
                );
              await db.query(
                "update gym.payroll_charges set voided_at=clock_timestamp(),voided_by=$3,void_reason=$4 where organization_id=$1 and id=$2",
                [s.organizationId, c.id, s.userId, v.reason],
              );
              await audit(
                db,
                s,
                "payroll.voided",
                c.id,
                v.reason,
                null,
                result,
              );
            } else {
              if (
                v.currency !== c.currency ||
                v.expectedBalanceMinor !== c.balance
              )
                throw new BusinessError(
                  "CONFLICT",
                  "Salary balance changed. Reload before paying.",
                );
              if (
                BigInt(v.amountMinor) > BigInt(c.balance) ||
                v.paidOn > org.today ||
                (v.method === "bank_transfer" && v.reference.length < 3)
              )
                throw new BusinessError(
                  "VALIDATION_ERROR",
                  "Use an actual payment date, an amount within the remaining balance and a bank reference for transfers.",
                );
              await lock(db, `payroll-category:${s.organizationId}`);
              let category = (
                await db.query(
                  "select id,name,active from gym.expense_categories where organization_id=$1 and normalized_name='staff salaries' for share",
                  [s.organizationId],
                )
              ).rows[0];
              if (!category)
                category = (
                  await db.query(
                    "insert into gym.expense_categories(organization_id,name,normalized_name,created_by,updated_by) values($1,'Staff salaries','staff salaries',$2,$2) returning id,name,active",
                    [s.organizationId, s.userId],
                  )
                ).rows[0];
              if (!category.active)
                throw new BusinessError(
                  "VALIDATION_ERROR",
                  "Activate the Staff salaries expense category before recording payroll.",
                );
              const seq = (
                  await db.query(
                    "insert into gym.number_counters(organization_id,kind,value) values($1,'expense',1) on conflict(organization_id,kind) do update set value=gym.number_counters.value+1 returning value::text",
                    [s.organizationId],
                  )
                ).rows[0].value,
                number = "EXP-" + seq.padStart(6, "0");
              const e = (
                await db.query(
                  "insert into gym.expenses(organization_id,branch_id,category_id,category_name,number,description,payee,amount_minor,currency,paid_on,method,reference,actor_id,request_key,request_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id",
                  [
                    s.organizationId,
                    c.branch_id,
                    category.id,
                    category.name,
                    number,
                    "Salary " + c.period_text.slice(0, 7),
                    c.employee_name,
                    v.amountMinor,
                    v.currency,
                    v.paidOn,
                    v.method,
                    v.reference,
                    s.userId,
                    v.requestKey,
                    hash,
                  ],
                )
              ).rows[0];
              await db.query(
                "insert into gym.payroll_payments(organization_id,charge_id,branch_id,expense_id,currency,created_by) values($1,$2,$3,$4,$5,$6)",
                [
                  s.organizationId,
                  c.id,
                  c.branch_id,
                  e.id,
                  c.currency,
                  s.userId,
                ],
              );
              result = { ...result, expenseId: e.id, number };
              await audit(db, s, "payroll.paid", c.id, v.reason, null, {
                ...result,
                amountMinor: v.amountMinor,
                currency: v.currency,
                paidOn: v.paidOn,
              });
            }
          }
          await db.query(
            "insert into gym.payroll_requests(organization_id,actor_id,request_key,request_hash,operation,branch_ids,result) values($1,$2,$3,$4,$5,$6,$7::jsonb)",
            [
              s.organizationId,
              s.userId,
              v.requestKey,
              hash,
              v.operation,
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
        ["23505", "23514", "23503", "40P01"].includes(String(e.code))
      )
        throw new BusinessError(
          "CONFLICT",
          "Payroll changed or conflicts with saved employee, trainer or branch details. Reload before another change.",
        );
      throw e;
    }
  }
  return { get, post };
}
