import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  bigint,
  date,
  timestamp,
  jsonb,
  unique,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { gym, organizations } from "./schema";
import { invoices } from "./membership-schema";
import { user } from "./auth-schema";
export const payments = gym.table(
  "payments",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    invoiceId: uuid("invoice_id").notNull(),
    memberId: uuid("member_id").notNull(),
    originatingBranchId: uuid("originating_branch_id").notNull(),
    receiptNumber: text("receipt_number").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text().notNull(),
    method: text().notNull(),
    paidOn: date("paid_on").notNull(),
    reference: text().notNull().default(""),
    note: text().notNull().default(""),
    balanceAfterMinor: bigint("balance_after_minor", {
      mode: "number",
    }).notNull(),
    activationResult: text("activation_result").notNull(),
    receiptSnapshot: jsonb("receipt_snapshot").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    requestKey: uuid("request_key").notNull(),
    requestHash: text("request_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.receiptNumber),
    unique().on(t.organizationId, t.actorId, t.requestKey),
    unique("payment_allocation_identity").on(
      t.organizationId,
      t.id,
      t.invoiceId,
      t.memberId,
      t.originatingBranchId,
      t.currency,
      t.amountMinor,
    ),
    foreignKey({
      columns: [
        t.organizationId,
        t.invoiceId,
        t.memberId,
        t.originatingBranchId,
        t.currency,
      ],
      foreignColumns: [
        invoices.organizationId,
        invoices.id,
        invoices.memberId,
        invoices.originatingBranchId,
        invoices.currency,
      ],
    }),
    index("payments_invoice_idx").on(t.organizationId, t.invoiceId),
    index("payments_member_date_idx").on(
      t.organizationId,
      t.memberId,
      t.paidOn,
      t.id,
    ),
    index("payments_branch_date_idx").on(
      t.organizationId,
      t.originatingBranchId,
      t.paidOn,
      t.id,
    ),
    index("payments_actor_idx").on(t.actorId),
    check(
      "payment_values",
      sql`${t.amountMinor} between 1 and 999999999999 and ${t.balanceAfterMinor} between 0 and 999999999999 and ${t.currency} ~ '^[A-Z]{3}$' and ${t.method} in ('cash','bank_transfer','other') and length(${t.reference})<=100 and length(${t.note})<=300 and (${t.method}<>'bank_transfer' or length(btrim(${t.reference}))>=3) and ${t.requestHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "payment_activation_result",
      sql`${t.activationResult} in ('activated','already_active','partial','not_linked','archived','cancelled','expired')`,
    ),
  ],
);
export const paymentAllocations = gym.table(
  "payment_allocations",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    paymentId: uuid("payment_id").notNull(),
    invoiceId: uuid("invoice_id").notNull(),
    memberId: uuid("member_id").notNull(),
    originatingBranchId: uuid("originating_branch_id").notNull(),
    currency: text().notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  },
  (t) => [
    unique().on(t.organizationId, t.paymentId),
    foreignKey({
      columns: [
        t.organizationId,
        t.paymentId,
        t.invoiceId,
        t.memberId,
        t.originatingBranchId,
        t.currency,
        t.amountMinor,
      ],
      foreignColumns: [
        payments.organizationId,
        payments.id,
        payments.invoiceId,
        payments.memberId,
        payments.originatingBranchId,
        payments.currency,
        payments.amountMinor,
      ],
    }),
    index("allocations_invoice_idx").on(t.organizationId, t.invoiceId),
    check(
      "allocation_positive",
      sql`${t.amountMinor} between 1 and 999999999999`,
    ),
  ],
);
