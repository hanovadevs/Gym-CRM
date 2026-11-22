import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { calendarDate } from "@/modules/memberships/schemas";
import { parse } from "@/modules/members/service";
import { BusinessError } from "@/server/errors";
const line = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (s) => !/[\u0000-\u001f\u007f]/.test(s),
      "Use a single line of text",
    );
const base = {
  organizationId: z.uuid(),
  requestKey: z.uuid(),
  reason: line(300).min(3),
};
const amount = z.string().regex(/^[1-9][0-9]{0,11}$/),
  currency = z.string().regex(/^[A-Z]{3}$/);
const mutation = z.discriminatedUnion("operation", [
  z
    .object({
      ...base,
      operation: z.literal("charge"),
      billingMonth: calendarDate.refine(
        (s) => s.endsWith("-01"),
        "Choose the first day of the billing month",
      ),
      dueOn: calendarDate,
      amountMinor: amount,
      currency,
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("payment"),
      chargeId: z.uuid(),
      amountMinor: amount,
      currency,
      expectedBalanceMinor: z.string().regex(/^(0|[1-9][0-9]{0,11})$/),
      paidOn: calendarDate,
      method: z.enum(["cash", "bank_transfer", "other"]),
      reference: line(100).default(""),
      note: line(300).default(""),
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("reverse"),
      paymentId: z.uuid(),
      cashOn: calendarDate,
    })
    .strict(),
  z
    .object({ ...base, operation: z.literal("void"), chargeId: z.uuid() })
    .strict(),
]);
const page = z.coerce.number().int().min(1).max(10000).default(1);
const query = z
  .object({
    organizationId: z.uuid(),
    page,
    paymentPage: page,
    chargeId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.uuid().optional(),
    ),
  })
  .strict();
export type FeeSummary = {
  month: string;
  status: "not_recorded" | "paid" | "unpaid" | "partial" | "overdue";
  chargeId: string | null;
  amountMinor: string | null;
  balanceMinor: string | null;
  currency: string | null;
  dueOn: string | null;
  outstanding: { currency: string; amountMinor: string }[];
};
export type FeeCharge = {
  id: string;
  billingMonth: string;
  dueOn: string;
  amountMinor: string;
  currency: string;
  paidMinor: string;
  balanceMinor: string;
  voidedAt: string | null;
  voidReason: string;
  status: "void" | "paid" | "unpaid" | "partial" | "overdue";
};
export type FeePayment = {
  id: string;
  chargeId: string;
  amountMinor: string;
  currency: string;
  paidOn: string;
  method: string;
  reference: string;
  note: string;
  reversedAt: string | null;
  reversalReason: string | null;
};
export type PlatformBillingData = {
  organization: {
    id: string;
    name: string;
    currency: string;
    locale: string;
    timeZone: string;
    active: boolean;
  };
  today: string;
  month: string;
  page: number;
  total: number;
  charges: FeeCharge[];
  selected: FeeCharge | null;
  paymentPage: number;
  paymentTotal: number;
  payments: FeePayment[];
  summary: FeeSummary;
  totals: {
    currency: string;
    chargedMinor: string;
    receivedMinor: string;
    balanceMinor: string;
  }[];
  template: { amountMinor: string; currency: string; dueDay: number } | null;
};
async function gym(db: PoolClient, id: string) {
  await db.query("select set_config('app.organization_id',$1,true)", [id]);
  const org = (
    await db.query(
      `select id,name,currency,locale,active,time_zone as "timeZone",(clock_timestamp() at time zone time_zone)::date::text today from gym.organizations where id=$1 for share`,
      [id],
    )
  ).rows[0];
  if (!org) throw new BusinessError("NOT_FOUND", "Gym not found.");
  return org;
}
const fields = `id,billing_month::text as "billingMonth",due_on::text as "dueOn",amount_minor::text as "amountMinor",currency,net_paid_minor::text as "paidMinor",balance_minor::text as "balanceMinor",to_jsonb(voided_at)#>>'{}' as "voidedAt",void_reason as "voidReason",case when voided_at is not null then 'void' when balance_minor=0 then 'paid' when due_on<$2::date then 'overdue' when net_paid_minor>0 then 'partial' else 'unpaid' end status`;
export async function readPlatformBilling(
  db: PoolClient,
  actorId: string,
  raw: unknown,
): Promise<PlatformBillingData> {
  const q = parse(query, raw),
    org = await gym(db, q.organizationId);
  const total = (
    await db.query(
      "select count(*)::int n from platform.billing_charges where organization_id=$1",
      [org.id],
    )
  ).rows[0].n;
  const currentPage = Math.max(1, Math.min(q.page, Math.ceil(total / 25)));
  const charges = (
    await db.query<FeeCharge>(
      `select ${fields} from platform.billing_balances where organization_id=$1 order by billing_month desc,created_at desc,id desc limit 25 offset $3`,
      [org.id, org.today, (currentPage - 1) * 25],
    )
  ).rows;
  let selected = q.chargeId
    ? (
        await db.query<FeeCharge>(
          `select ${fields} from platform.billing_balances where organization_id=$1 and id=$3`,
          [org.id, org.today, q.chargeId],
        )
      ).rows[0]
    : (charges.find((c) => c.status !== "void") ?? charges[0] ?? null);
  if (q.chargeId && !selected)
    throw new BusinessError(
      "NOT_FOUND",
      "Monthly charge not found in this gym.",
    );
  selected = selected ?? null;
  const paymentTotal = selected
    ? (
        await db.query(
          "select count(*)::int n from platform.billing_payments where organization_id=$1 and charge_id=$2",
          [org.id, selected.id],
        )
      ).rows[0].n
    : 0;
  const paymentPage = Math.max(
    1,
    Math.min(q.paymentPage, Math.ceil(paymentTotal / 25)),
  );
  const payments = selected
    ? (
        await db.query<FeePayment>(
          `select p.id,p.charge_id as "chargeId",p.amount_minor::text as "amountMinor",p.currency,p.paid_on::text as "paidOn",p.method,p.reference,p.note,to_jsonb(r.created_at)#>>'{}' as "reversedAt",r.reason as "reversalReason" from platform.billing_payments p left join platform.billing_reversals r on r.organization_id=p.organization_id and r.payment_id=p.id where p.organization_id=$1 and p.charge_id=$2 order by p.created_at desc,p.id desc limit 25 offset $3`,
          [org.id, selected.id, (paymentPage - 1) * 25],
        )
      ).rows
    : [];
  const summary = (
    await db.query("select platform.billing_summary($1,$2) data", [
      actorId,
      org.id,
    ])
  ).rows[0].data;
  const totals = (
    await db.query(
      `select currency,coalesce(sum(amount_minor) filter(where voided_at is null),0)::text as "chargedMinor",sum(net_paid_minor)::text as "receivedMinor",sum(balance_minor)::text as "balanceMinor" from platform.billing_balances where organization_id=$1 group by currency order by currency`,
      [org.id],
    )
  ).rows;
  const template =
    (
      await db.query(
        `select amount_minor::text as "amountMinor",currency,extract(day from due_on)::int as "dueDay" from platform.billing_charges where organization_id=$1 order by billing_month desc,created_at desc limit 1`,
        [org.id],
      )
    ).rows[0] ?? null;
  return {
    organization: {
      id: org.id,
      name: org.name,
      currency: org.currency,
      locale: org.locale,
      timeZone: org.timeZone,
      active: org.active,
    },
    today: org.today,
    month: org.today.slice(0, 7) + "-01",
    page: currentPage,
    total,
    charges,
    selected,
    paymentPage,
    paymentTotal,
    payments,
    summary,
    totals,
    template,
  };
}
export async function savePlatformBilling(
  db: PoolClient,
  actorId: string,
  raw: unknown,
) {
  const v = parse(mutation, raw),
    org = await gym(db, v.organizationId);
  await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `platform-billing-request:${org.id}:${actorId}:${v.requestKey}`,
  ]);
  const hash = createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const prior = (
    await db.query(
      "select request_hash,result from platform.billing_requests where organization_id=$1 and actor_id=$2 and request_key=$3",
      [org.id, actorId, v.requestKey],
    )
  ).rows[0];
  if (prior) {
    if (prior.request_hash !== hash)
      throw new BusinessError(
        "CONFLICT",
        "This request was already used for another billing change.",
      );
    return prior.result as {
      chargeId: string;
      paymentId?: string;
      reversalId?: string;
    };
  }
  await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    "platform-billing:" + org.id,
  ]);
  let result: { chargeId: string; paymentId?: string; reversalId?: string };
  if (v.operation === "charge") {
    if (v.dueOn < v.billingMonth)
      throw new BusinessError(
        "VALIDATION_ERROR",
        "Choose a due date in the billing month or later.",
      );
    const row = (
      await db.query(
        "insert into platform.billing_charges(organization_id,billing_month,due_on,amount_minor,currency,created_by) values($1,$2,$3,$4,$5,$6) returning id",
        [org.id, v.billingMonth, v.dueOn, v.amountMinor, v.currency, actorId],
      )
    ).rows[0];
    result = { chargeId: row.id };
  } else if (v.operation === "reverse") {
    const payment = (
      await db.query(
        "select * from platform.billing_payments where organization_id=$1 and id=$2",
        [org.id, v.paymentId],
      )
    ).rows[0];
    if (!payment)
      throw new BusinessError("NOT_FOUND", "Payment not found in this gym.");
    const cashDate = (
      await db.query(
        "select paid_on::text as paid_date from platform.billing_payments where id=$1",
        [payment.id],
      )
    ).rows[0].paid_date;
    if (v.cashOn > org.today || v.cashOn < cashDate)
      throw new BusinessError(
        "VALIDATION_ERROR",
        "Choose an actual reversal date between the payment date and today.",
      );
    const row = (
      await db.query(
        "insert into platform.billing_reversals(organization_id,payment_id,charge_id,amount_minor,currency,cash_on,reason,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id",
        [
          org.id,
          payment.id,
          payment.charge_id,
          payment.amount_minor,
          payment.currency,
          v.cashOn,
          v.reason,
          actorId,
        ],
      )
    ).rows[0];
    result = {
      chargeId: payment.charge_id,
      paymentId: payment.id,
      reversalId: row.id,
    };
  } else {
    const charge = (
      await db.query(
        `select id,currency,balance_minor::text balance,net_paid_minor::text paid,voided_at from platform.billing_balances where organization_id=$1 and id=$2`,
        [org.id, v.chargeId],
      )
    ).rows[0];
    if (!charge)
      throw new BusinessError(
        "NOT_FOUND",
        "Monthly charge not found in this gym.",
      );
    if (charge.voided_at)
      throw new BusinessError(
        "CONFLICT",
        "This monthly charge was voided. Reload the current ledger.",
      );
    if (v.operation === "void") {
      if (BigInt(charge.paid) !== 0n)
        throw new BusinessError(
          "CONFLICT",
          "Reverse retained payments before voiding this charge.",
        );
      await db.query(
        "update platform.billing_charges set voided_at=clock_timestamp(),voided_by=$3,void_reason=$4 where organization_id=$1 and id=$2",
        [org.id, charge.id, actorId, v.reason],
      );
      result = { chargeId: charge.id };
    } else {
      if (
        v.currency !== charge.currency ||
        v.expectedBalanceMinor !== charge.balance
      )
        throw new BusinessError(
          "CONFLICT",
          "The fee balance changed. Reload before recording a payment.",
        );
      if (
        v.paidOn > org.today ||
        BigInt(v.amountMinor) > BigInt(charge.balance)
      )
        throw new BusinessError(
          "VALIDATION_ERROR",
          "Record an actual payment date and an amount no greater than the remaining balance.",
        );
      if (v.method === "bank_transfer" && v.reference.length < 3)
        throw new BusinessError(
          "VALIDATION_ERROR",
          "Add a bank transfer reference.",
        );
      const row = (
        await db.query(
          "insert into platform.billing_payments(organization_id,charge_id,amount_minor,currency,paid_on,method,reference,note,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
          [
            org.id,
            charge.id,
            v.amountMinor,
            v.currency,
            v.paidOn,
            v.method,
            v.reference,
            v.note,
            actorId,
          ],
        )
      ).rows[0];
      result = { chargeId: charge.id, paymentId: row.id };
    }
  }
  await db.query(
    "insert into platform.billing_requests(organization_id,actor_id,request_key,request_hash,operation,reason,result) values($1,$2,$3,$4,$5,$6,$7::jsonb)",
    [
      org.id,
      actorId,
      v.requestKey,
      hash,
      v.operation,
      v.reason,
      JSON.stringify(result),
    ],
  );
  return result;
}
