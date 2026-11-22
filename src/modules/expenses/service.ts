import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { createSecurity, Scope } from "@/server/security/service";
import { can } from "@/server/security/permissions";
import { BusinessError } from "@/server/errors";
import { audit } from "@/server/audit";
import { parse } from "@/modules/members/service";
import { daysBetween } from "@/modules/memberships/state";
import {
  expenseInput,
  expenseQuery,
  reversalInput,
  categoryInput,
} from "./schemas";
import type { ExpensesData, ExpenseCategory, ExpenseResult } from "./types";
async function organization(db: PoolClient, s: Scope) {
  return (
    await db.query(
      'select id,name,currency,locale,time_zone as "timeZone",(clock_timestamp() at time zone time_zone)::date::text today from gym.organizations where id=$1',
      [s.organizationId],
    )
  ).rows[0];
}
async function lock(db: PoolClient, s: Scope, key: string) {
  await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `expense-request:${s.organizationId}:${s.userId}:${key}`,
  ]);
}
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function conflict(error: unknown): never {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  )
    throw new BusinessError(
      "CONFLICT",
      "This record already exists. Reload to review the saved expense or category.",
    );
  throw error;
}
export function createExpensesService(
  security: ReturnType<typeof createSecurity>,
) {
  async function get(headers: Headers, raw: unknown): Promise<ExpensesData> {
    const q = parse(expenseQuery, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId, branchId: q.branchId },
      "expenses.manage",
      async (db, s) => {
        const org = await organization(db, s),
          from = q.from ?? org.today.slice(0, 7) + "-01",
          to = q.to ?? org.today;
        if (from > to || daysBetween(from, to) > 366)
          throw new BusinessError(
            "VALIDATION_ERROR",
            "Choose a valid expense range of at most one year.",
          );
        const categories = (
          await db.query<ExpenseCategory>(
            "select id,name,active,version from gym.expense_categories where organization_id=$1 order by active desc,name,id",
            [s.organizationId],
          )
        ).rows;
        if (q.categoryId && !categories.some((c) => c.id === q.categoryId))
          throw new BusinessError("NOT_FOUND", "Expense category unavailable.");
        const result = (
          await db.query(
            `with ledger as (
    select e.id,e.id as "expenseId",'expense' as kind,e.number,e.description,e.payee,e.branch_id as "branchId",b.name as "branchName",e.category_id as "categoryId",e.category_name as "categoryName",e.paid_on as "cashOn",e.amount_minor::numeric amount,e.currency,e.method,e.reference,e.file_id as "fileId",exists(select 1 from gym.expense_reversals r where r.organization_id=e.organization_id and r.expense_id=e.id) reversed,'' as "reversalReason",e.replaces_expense_id as "replacesExpenseId",(select replacement.id from gym.expenses replacement where replacement.organization_id=e.organization_id and replacement.replaces_expense_id=e.id) as "replacementId"
    from gym.expenses e join gym.branches b on b.organization_id=e.organization_id and b.id=e.branch_id where e.organization_id=$1 and e.branch_id=any($2::uuid[])
    union all
    select r.id,e.id,'reversal',e.number,e.description,e.payee,e.branch_id,b.name,e.category_id,e.category_name,r.cash_on,-r.amount_minor::numeric,e.currency,e.method,e.reference,e.file_id,true,r.reason,e.replaces_expense_id,(select replacement.id from gym.expenses replacement where replacement.organization_id=e.organization_id and replacement.replaces_expense_id=e.id)
    from gym.expense_reversals r join gym.expenses e on e.organization_id=r.organization_id and e.id=r.expense_id join gym.branches b on b.organization_id=e.organization_id and b.id=e.branch_id where r.organization_id=$1 and r.branch_id=any($2::uuid[])
   ),filtered as(select * from ledger where "cashOn" between $3::date and $4::date and ($5::uuid is null or "categoryId"=$5) and ($6='all' or kind=$6) and (number ilike $7 or description ilike $7 or payee ilike $7 or reference ilike $7)), tally as(select count(*)::int total from filtered), bounds as(select total,greatest(1,least($8::int,(total+24)/25)) page from tally)
   select total,page,coalesce((select jsonb_agg(to_jsonb(entry)-'amount') from (select *,amount::text as "amountMinor" from filtered order by "cashOn" desc,id desc limit 25 offset(select(page-1)*25 from bounds))entry),'[]'::jsonb) rows,
   coalesce((select jsonb_agg(summary) from(select currency,coalesce(sum(amount) filter(where kind='expense'),0)::text as "postedMinor",coalesce(-sum(amount) filter(where kind='reversal'),0)::text as "reversedMinor",sum(amount)::text as "netMinor" from filtered group by currency order by currency)summary),'[]'::jsonb) summary from bounds`,
            [
              s.organizationId,
              [...s.branchIds],
              from,
              to,
              q.categoryId ?? null,
              q.kind,
              "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%",
              q.page,
            ],
          )
        ).rows[0];
        const branches = (
          await db.query(
            "select id,name from gym.branches where organization_id=$1 and id=any($2::uuid[]) order by name,id",
            [s.organizationId, [...s.authorizedBranchIds]],
          )
        ).rows;
        return {
          ...result,
          organization: {
            id: org.id,
            name: org.name,
            currency: org.currency,
            locale: org.locale,
            timeZone: org.timeZone,
          },
          branches,
          categories,
          branchId: q.branchId ?? "",
          categoryId: q.categoryId ?? "",
          today: org.today,
          from,
          to,
          q: q.q,
          kind: q.kind,
          canManageSettings: can(s.role, "settings.read"),
          canManageMembers: can(s.role, "members.manage"),
          canReadPlans: can(s.role, "plans.read"),
          canReadBilling: can(s.role, "billing.read"),
          requestId: s.requestId,
        };
      },
    );
  }
  async function post(headers: Headers, raw: unknown): Promise<ExpenseResult> {
    const v = parse(expenseInput, raw);
    try {
      return await security.run(
        headers,
        { organizationId: v.organizationId, branchId: v.branchId },
        "expenses.manage",
        async (db, s) => {
          await lock(db, s, v.requestKey);
          const requestHash = hash(v);
          const prior = (
            await db.query(
              "select id,number,request_hash from gym.expenses where organization_id=$1 and actor_id=$2 and request_key=$3",
              [s.organizationId, s.userId, v.requestKey],
            )
          ).rows[0];
          if (prior) {
            if (prior.request_hash !== requestHash)
              throw new BusinessError(
                "CONFLICT",
                "This request was already used for another expense.",
              );
            return {
              expenseId: prior.id,
              number: prior.number,
              requestId: s.requestId,
            };
          }
          const org = await organization(db, s);
          if (v.paidOn > org.today)
            throw new BusinessError(
              "VALIDATION_ERROR",
              "Record expenses on their actual cash date, today or earlier.",
            );
          let currency = org.currency;
          if (v.replacesExpenseId) {
            await db.query(
              "select pg_advisory_xact_lock(hashtextextended($1,0))",
              [`expense:${s.organizationId}:${v.replacesExpenseId}`],
            );
            const original = (
              await db.query(
                "select e.currency,r.cash_on::text as cash_on from gym.expenses e join gym.expense_reversals r on r.organization_id=e.organization_id and r.expense_id=e.id where e.organization_id=$1 and e.id=$2 and e.branch_id=$3",
                [s.organizationId, v.replacesExpenseId, v.branchId],
              )
            ).rows[0];
            if (!original)
              throw new BusinessError(
                "CONFLICT",
                "Reverse the original expense in this branch before creating its replacement.",
              );
            if (v.paidOn < original.cash_on)
              throw new BusinessError(
                "VALIDATION_ERROR",
                "Replacement cash date cannot precede the recorded reversal.",
              );
            currency = original.currency;
          }
          if (v.currency !== currency)
            throw new BusinessError(
              "CONFLICT",
              "Expense currency changed. Reload and review the amount.",
            );
          const category = (
            await db.query(
              "select name from gym.expense_categories where organization_id=$1 and id=$2 and active for share",
              [s.organizationId, v.categoryId],
            )
          ).rows[0];
          if (!category)
            throw new BusinessError(
              "NOT_FOUND",
              "Choose an active expense category.",
            );
          if (
            v.fileId &&
            !(
              await db.query(
                "select id from gym.private_files where organization_id=$1 and id=$2 and branch_id=$3 and uploaded_by=$4",
                [s.organizationId, v.fileId, v.branchId, s.userId],
              )
            ).rowCount
          )
            throw new BusinessError(
              "NOT_FOUND",
              "Receipt not found in your upload scope.",
            );
          const sequence = (
            await db.query(
              "insert into gym.number_counters(organization_id,kind,value) values($1,'expense',1) on conflict(organization_id,kind) do update set value=gym.number_counters.value+1 returning value::text",
              [s.organizationId],
            )
          ).rows[0].value;
          const number = "EXP-" + sequence.padStart(6, "0");
          const saved = (
            await db.query(
              "insert into gym.expenses(organization_id,branch_id,category_id,category_name,number,description,payee,amount_minor,currency,paid_on,method,reference,file_id,replaces_expense_id,actor_id,request_key,request_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id",
              [
                s.organizationId,
                v.branchId,
                v.categoryId,
                category.name,
                number,
                v.description,
                v.payee,
                v.amountMinor,
                v.currency,
                v.paidOn,
                v.method,
                v.reference,
                v.fileId ?? null,
                v.replacesExpenseId ?? null,
                s.userId,
                v.requestKey,
                requestHash,
              ],
            )
          ).rows[0];
          await audit(
            db,
            s,
            "expense.posted",
            saved.id,
            "Cash expense posted",
            null,
            {
              branchId: v.branchId,
              number,
              amountMinor: v.amountMinor,
              currency: v.currency,
              paidOn: v.paidOn,
              categoryId: v.categoryId,
              receipt: !!v.fileId,
              replacesExpenseId: v.replacesExpenseId ?? null,
            },
          );
          return { expenseId: saved.id, number, requestId: s.requestId };
        },
      );
    } catch (error) {
      conflict(error);
    }
  }
  async function reverse(headers: Headers, raw: unknown) {
    const v = parse(reversalInput, raw);
    try {
      return await security.run(
        headers,
        { organizationId: v.organizationId },
        "expenses.manage",
        async (db, s) => {
          await lock(db, s, v.requestKey);
          const requestHash = hash(v);
          const prior = (
            await db.query(
              "select id,expense_id,branch_id,request_hash from gym.expense_reversals where organization_id=$1 and actor_id=$2 and request_key=$3",
              [s.organizationId, s.userId, v.requestKey],
            )
          ).rows[0];
          if (prior) {
            if (!s.branchIds.includes(prior.branch_id))
              throw new BusinessError("NOT_FOUND", "Expense unavailable.");
            if (prior.request_hash !== requestHash)
              throw new BusinessError(
                "CONFLICT",
                "This reversal request was already used.",
              );
            return {
              expenseId: prior.expense_id,
              reversalId: prior.id,
              requestId: s.requestId,
            };
          }
          await db.query(
            "select pg_advisory_xact_lock(hashtextextended($1,0))",
            [`expense:${s.organizationId}:${v.expenseId}`],
          );
          const original = (
            await db.query(
              "select e.*,e.paid_on::text as paid_date,exists(select 1 from gym.expense_reversals r where r.organization_id=e.organization_id and r.expense_id=e.id) reversed from gym.expenses e where e.organization_id=$1 and e.id=$2 and e.branch_id=any($3::uuid[])",
              [s.organizationId, v.expenseId, [...s.branchIds]],
            )
          ).rows[0];
          if (!original)
            throw new BusinessError(
              "NOT_FOUND",
              "Expense not found in your branch scope.",
            );
          if (original.reversed)
            throw new BusinessError(
              "CONFLICT",
              "This expense has already been reversed. Reload to review its history.",
            );
          const org = await organization(db, s);
          if (v.cashOn < original.paid_date || v.cashOn > org.today)
            throw new BusinessError(
              "VALIDATION_ERROR",
              "Reversal cash date must be on or after the original cash date and no later than today.",
            );
          const saved = (
            await db.query(
              "insert into gym.expense_reversals(organization_id,expense_id,branch_id,currency,amount_minor,cash_on,reason,actor_id,request_key,request_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id",
              [
                s.organizationId,
                original.id,
                original.branch_id,
                original.currency,
                original.amount_minor,
                v.cashOn,
                v.reason,
                s.userId,
                v.requestKey,
                requestHash,
              ],
            )
          ).rows[0];
          await audit(
            db,
            s,
            "expense.reversed",
            original.id,
            v.reason,
            {
              amountMinor: String(original.amount_minor),
              currency: original.currency,
            },
            {
              reversalId: saved.id,
              cashOn: v.cashOn,
              branchId: original.branch_id,
            },
          );
          return {
            expenseId: original.id,
            reversalId: saved.id,
            requestId: s.requestId,
          };
        },
      );
    } catch (error) {
      conflict(error);
    }
  }
  async function category(headers: Headers, raw: unknown) {
    const v = parse(categoryInput, raw);
    try {
      return await security.run(
        headers,
        { organizationId: v.organizationId },
        "expenses.manage",
        async (db, s) => {
          await db.query(
            "select pg_advisory_xact_lock(hashtextextended($1,0))",
            [`expense-category:${s.organizationId}`],
          );
          const old = (
            await db.query(
              "select id,name,active,version,created_by from gym.expense_categories where organization_id=$1 and id=$2 for update",
              [s.organizationId, v.id],
            )
          ).rows[0];
          if (v.operation === "create" && old) {
            if (old.created_by !== s.userId || old.name !== v.name)
              throw new BusinessError(
                "CONFLICT",
                "Category already exists with different values.",
              );
            return { categoryId: old.id, requestId: s.requestId };
          }
          if (v.operation === "update") {
            if (!old)
              throw new BusinessError(
                "NOT_FOUND",
                "Expense category unavailable.",
              );
            if (old.version !== v.version)
              throw new BusinessError(
                "CONFLICT",
                "This category changed. Reload before editing it.",
              );
            await db.query(
              "update gym.expense_categories set name=$3,normalized_name=lower(btrim($3)),active=$4,version=version+1,updated_by=$5,updated_at=clock_timestamp() where organization_id=$1 and id=$2",
              [s.organizationId, v.id, v.name, v.active, s.userId],
            );
          } else
            await db.query(
              "insert into gym.expense_categories(id,organization_id,name,normalized_name,created_by,updated_by) values($1,$2,$3,lower(btrim($3)),$4,$4)",
              [v.id, s.organizationId, v.name, s.userId],
            );
          await audit(
            db,
            s,
            v.operation === "create"
              ? "expense.category_created"
              : "expense.category_updated",
            v.id,
            v.reason,
            old ? { name: old.name, active: old.active } : null,
            {
              name: v.name,
              active: v.operation === "create" ? true : v.active,
            },
          );
          return { categoryId: v.id, requestId: s.requestId };
        },
      );
    } catch (error) {
      conflict(error);
    }
  }
  return { get, post, reverse, category };
}
