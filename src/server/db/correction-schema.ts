import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  bigint,
  date,
  timestamp,
  unique,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { gym, organizations } from "./schema";
import { invoices } from "./membership-schema";
import { payments } from "./payment-schema";
import { user } from "./auth-schema";
export const financialCorrections = gym.table(
  "financial_corrections",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    invoiceId: uuid("invoice_id").notNull(),
    memberId: uuid("member_id").notNull(),
    originatingBranchId: uuid("originating_branch_id").notNull(),
    paymentId: uuid("payment_id"),
    kind: text().notNull(),
    number: text().notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text().notNull(),
    cashOn: date("cash_on").notNull(),
    method: text(),
    reason: text().notNull(),
    reference: text().notNull().default(""),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    requestKey: uuid("request_key").notNull(),
    requestHash: text("request_hash").notNull(),
    balanceAfterMinor: bigint("balance_after_minor", {
      mode: "number",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "correction_method",
      sql`case when ${t.kind} in ('refund','refund_credit') then ${t.method} is not null and ${t.method} in ('cash','bank_transfer','other') else ${t.method} is null end`,
    ),
    unique().on(t.organizationId, t.number),
    unique().on(t.organizationId, t.actorId, t.requestKey),
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
    foreignKey({
      columns: [t.organizationId, t.paymentId],
      foreignColumns: [payments.organizationId, payments.id],
    }),
    index("corrections_invoice_idx").on(t.organizationId, t.invoiceId),
    index("corrections_payment_idx").on(t.organizationId, t.paymentId),
    index("corrections_cash_idx").on(
      t.organizationId,
      t.originatingBranchId,
      t.cashOn,
    ),
    check(
      "correction_values",
      sql`${t.kind} in ('credit','refund','refund_credit','void') and ${t.amountMinor} between 0 and 999999999999 and (${t.kind}='void')=(${t.amountMinor}=0) and (${t.kind} in ('refund','refund_credit'))=(${t.paymentId} is not null) and ${t.balanceAfterMinor} between 0 and 999999999999 and length(btrim(${t.reason})) between 3 and 300 and length(${t.reference})<=100 and ${t.requestHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);
