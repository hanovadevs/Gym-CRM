import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  integer,
  bigint,
  boolean,
  date,
  timestamp,
  customType,
  unique,
  uniqueIndex,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { gym, organizations, branches } from "./schema";
import { user } from "./auth-schema";
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const privateFiles = gym.table(
  "private_files",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    branchId: uuid("branch_id").notNull(),
    filename: text().notNull(),
    contentType: text("content_type").notNull(),
    content: bytea().notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text().notNull(),
    purpose: text().notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    requestKey: uuid("request_key").notNull(),
    requestHash: text("request_hash").notNull(),
  },
  (t) => [
    unique().on(t.organizationId, t.id, t.branchId),
    unique().on(t.organizationId, t.uploadedBy, t.requestKey),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    index("private_files_branch_time_idx").on(
      t.organizationId,
      t.branchId,
      t.uploadedAt,
    ),
    check(
      "private_file_values",
      sql`${t.sizeBytes} between 1 and 2097152 and octet_length(${t.content})=${t.sizeBytes} and ${t.sha256} ~ '^[0-9a-f]{64}$' and ${t.requestHash} ~ '^[0-9a-f]{64}$' and ${t.contentType} in ('image/png','image/jpeg') and ${t.purpose}='expense_receipt' and length(${t.filename}) between 1 and 160 and ${t.filename} !~ E'[\\r\\n]'`,
    ),
  ],
);
export const expenseCategories = gym.table(
  "expense_categories",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text().notNull(),
    normalizedName: text("normalized_name").notNull(),
    active: boolean().notNull().default(true),
    version: integer().notNull().default(1),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.normalizedName),
    check(
      "expense_category_values",
      sql`length(btrim(${t.name})) between 1 and 80 and ${t.normalizedName}=lower(btrim(${t.name})) and ${t.version}>0`,
    ),
  ],
);
export const expenses = gym.table(
  "expenses",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    branchId: uuid("branch_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    categoryName: text("category_name").notNull(),
    number: text().notNull(),
    description: text().notNull(),
    payee: text().notNull().default(""),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text().notNull(),
    paidOn: date("paid_on").notNull(),
    method: text().notNull(),
    reference: text().notNull().default(""),
    fileId: uuid("file_id"),
    replacesExpenseId: uuid("replaces_expense_id"),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    requestKey: uuid("request_key").notNull(),
    requestHash: text("request_hash").notNull(),
  },
  (t) => [
    unique().on(t.organizationId, t.id, t.branchId),
    unique("expense_reversal_identity").on(
      t.organizationId,
      t.id,
      t.branchId,
      t.currency,
      t.amountMinor,
    ),
    unique().on(t.organizationId, t.number),
    unique().on(t.organizationId, t.actorId, t.requestKey),
    uniqueIndex("expense_one_replacement")
      .on(t.organizationId, t.replacesExpenseId)
      .where(sql`${t.replacesExpenseId} is not null`),
    uniqueIndex("expense_one_receipt")
      .on(t.organizationId, t.fileId)
      .where(sql`${t.fileId} is not null`),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.categoryId],
      foreignColumns: [expenseCategories.organizationId, expenseCategories.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.fileId, t.branchId],
      foreignColumns: [
        privateFiles.organizationId,
        privateFiles.id,
        privateFiles.branchId,
      ],
    }),
    foreignKey({
      columns: [t.organizationId, t.replacesExpenseId, t.branchId],
      foreignColumns: [t.organizationId, t.id, t.branchId],
    }),
    index("expense_branch_cash_idx").on(
      t.organizationId,
      t.branchId,
      t.paidOn,
      t.id,
    ),
    index("expense_category_idx").on(t.organizationId, t.categoryId, t.paidOn),
    check(
      "expense_values",
      sql`${t.amountMinor} between 1 and 999999999999 and ${t.currency} ~ '^[A-Z]{3}$' and ${t.method} in ('cash','bank_transfer','other') and length(btrim(${t.description})) between 3 and 300 and length(btrim(${t.categoryName})) between 1 and 80 and length(${t.payee})<=120 and length(${t.reference})<=100 and ${t.requestHash} ~ '^[0-9a-f]{64}$' and ${t.replacesExpenseId} is distinct from ${t.id}`,
    ),
  ],
);
export const expenseReversals = gym.table(
  "expense_reversals",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    expenseId: uuid("expense_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    currency: text().notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    cashOn: date("cash_on").notNull(),
    reason: text().notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    requestKey: uuid("request_key").notNull(),
    requestHash: text("request_hash").notNull(),
  },
  (t) => [
    unique().on(t.organizationId, t.expenseId),
    unique().on(t.organizationId, t.actorId, t.requestKey),
    foreignKey({
      columns: [
        t.organizationId,
        t.expenseId,
        t.branchId,
        t.currency,
        t.amountMinor,
      ],
      foreignColumns: [
        expenses.organizationId,
        expenses.id,
        expenses.branchId,
        expenses.currency,
        expenses.amountMinor,
      ],
    }),
    index("expense_reversal_cash_idx").on(
      t.organizationId,
      t.branchId,
      t.cashOn,
    ),
    check(
      "expense_reversal_values",
      sql`${t.amountMinor} between 1 and 999999999999 and length(btrim(${t.reason})) between 3 and 300 and ${t.requestHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);
