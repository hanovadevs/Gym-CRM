import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  bigint,
  date,
  timestamp,
  jsonb,
  unique,
  uniqueIndex,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { platform } from "./platform-schema";
import { organizations } from "./schema";
import { user } from "./auth-schema";
const actor = () => ({
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const platformCharges = platform.table(
  "billing_charges",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    billingMonth: date("billing_month").notNull(),
    dueOn: date("due_on").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text().notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: text("voided_by").references(() => user.id),
    voidReason: text("void_reason").notNull().default(""),
    ...actor(),
  },
  (t) => [
    unique().on(t.organizationId, t.id, t.currency),
    uniqueIndex("platform_monthly_charge_once")
      .on(t.organizationId, t.billingMonth)
      .where(sql`${t.voidedAt} is null`),
    index("platform_charges_period_idx").on(t.organizationId, t.billingMonth),
    check(
      "platform_charge_values",
      sql`extract(day from ${t.billingMonth})=1 and ${t.dueOn}>=${t.billingMonth} and ${t.amountMinor}>0 and ${t.amountMinor}<=999999999999 and ${t.currency} ~ '^[A-Z]{3}$' and ((${t.voidedAt} is null and ${t.voidedBy} is null and ${t.voidReason}='') or (${t.voidedAt} is not null and ${t.voidedBy} is not null and length(btrim(${t.voidReason})) between 3 and 300))`,
    ),
  ],
);
export const platformPayments = platform.table(
  "billing_payments",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    chargeId: uuid("charge_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text().notNull(),
    paidOn: date("paid_on").notNull(),
    method: text().notNull(),
    reference: text().notNull().default(""),
    note: text().notNull().default(""),
    ...actor(),
  },
  (t) => [
    unique().on(t.organizationId, t.id, t.chargeId, t.amountMinor, t.currency),
    foreignKey({
      columns: [t.organizationId, t.chargeId, t.currency],
      foreignColumns: [
        platformCharges.organizationId,
        platformCharges.id,
        platformCharges.currency,
      ],
    }),
    index("platform_payment_charge_idx").on(t.organizationId, t.chargeId),
    check(
      "platform_payment_values",
      sql`${t.amountMinor}>0 and ${t.amountMinor}<=999999999999 and ${t.method} in ('cash','bank_transfer','other') and length(${t.reference})<=100 and length(${t.note})<=300 and (${t.method}<>'bank_transfer' or length(btrim(${t.reference}))>=3)`,
    ),
  ],
);
export const platformPaymentReversals = platform.table(
  "billing_reversals",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    paymentId: uuid("payment_id").notNull(),
    chargeId: uuid("charge_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text().notNull(),
    cashOn: date("cash_on").notNull(),
    reason: text().notNull(),
    ...actor(),
  },
  (t) => [
    unique().on(t.organizationId, t.paymentId),
    foreignKey({
      columns: [
        t.organizationId,
        t.paymentId,
        t.chargeId,
        t.amountMinor,
        t.currency,
      ],
      foreignColumns: [
        platformPayments.organizationId,
        platformPayments.id,
        platformPayments.chargeId,
        platformPayments.amountMinor,
        platformPayments.currency,
      ],
    }),
    index("platform_reversal_charge_idx").on(t.organizationId, t.chargeId),
    check(
      "platform_reversal_reason",
      sql`length(btrim(${t.reason})) between 3 and 300`,
    ),
  ],
);
export const platformBillingRequests = platform.table(
  "billing_requests",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    requestKey: uuid("request_key").notNull(),
    requestHash: text("request_hash").notNull(),
    operation: text().notNull(),
    reason: text().notNull(),
    result: jsonb().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.actorId, t.requestKey),
    index("platform_billing_requests_time_idx").on(
      t.organizationId,
      t.createdAt,
    ),
    check(
      "platform_billing_request_values",
      sql`${t.operation} in ('charge','payment','reverse','void') and ${t.requestHash} ~ '^[0-9a-f]{64}$' and length(btrim(${t.reason})) between 3 and 300 and jsonb_typeof(${t.result})='object'`,
    ),
  ],
);
