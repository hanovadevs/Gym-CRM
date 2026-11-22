import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  integer,
  bigint,
  boolean,
  date,
  timestamp,
  jsonb,
  unique,
  uniqueIndex,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { gym, organizations, branches } from "./schema";
import { user } from "./auth-schema";
import { trainers } from "./training-schema";
import { expenses } from "./expense-schema";
const created = () => ({
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const employees = gym.table(
  "employees",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    branchId: uuid("branch_id").notNull(),
    trainerId: uuid("trainer_id"),
    name: text().notNull(),
    title: text().notNull(),
    phone: text().notNull().default(""),
    email: text().notNull().default(""),
    startOn: date("start_on").notNull(),
    active: boolean().notNull().default(true),
    salaryMinor: bigint("salary_minor", { mode: "bigint" }),
    currency: text().notNull(),
    payDay: integer("pay_day").notNull().default(1),
    version: integer().notNull().default(1),
    ...created(),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.trainerId],
      foreignColumns: [trainers.organizationId, trainers.id],
    }),
    uniqueIndex("employee_trainer_once")
      .on(t.organizationId, t.trainerId)
      .where(sql`${t.trainerId} is not null`),
    index("employee_directory_idx").on(
      t.organizationId,
      t.branchId,
      t.name,
      t.id,
    ),
    check(
      "employee_values",
      sql`length(btrim(${t.name})) between 2 and 100 and length(btrim(${t.title})) between 2 and 100 and length(${t.phone})<=50 and length(${t.email})<=254 and (${t.salaryMinor} is null or ${t.salaryMinor} between 1 and 999999999999) and ${t.currency} ~ '^[A-Z]{3}$' and ${t.payDay} between 1 and 28 and ${t.version}>0`,
    ),
  ],
);
export const payrollCharges = gym.table(
  "payroll_charges",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    employeeName: text("employee_name").notNull(),
    employeeTitle: text("employee_title").notNull(),
    period: date().notNull(),
    dueOn: date("due_on").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text().notNull(),
    ...created(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: text("voided_by").references(() => user.id),
    voidReason: text("void_reason").notNull().default(""),
  },
  (t) => [
    unique().on(t.organizationId, t.id, t.branchId, t.currency),
    foreignKey({
      columns: [t.organizationId, t.employeeId],
      foreignColumns: [employees.organizationId, employees.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    uniqueIndex("payroll_employee_period_once")
      .on(t.organizationId, t.employeeId, t.period)
      .where(sql`${t.voidedAt} is null`),
    index("payroll_branch_period_idx").on(
      t.organizationId,
      t.branchId,
      t.period,
      t.id,
    ),
    check(
      "payroll_charge_values",
      sql`extract(day from ${t.period})=1 and ${t.dueOn}>=${t.period} and ${t.amountMinor} between 1 and 999999999999 and ${t.currency} ~ '^[A-Z]{3}$' and ((${t.voidedAt} is null and ${t.voidedBy} is null and ${t.voidReason}='') or (${t.voidedAt} is not null and ${t.voidedBy} is not null and length(btrim(${t.voidReason})) between 3 and 300))`,
    ),
  ],
);
export const payrollPayments = gym.table(
  "payroll_payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    chargeId: uuid("charge_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    expenseId: uuid("expense_id").notNull(),
    currency: text().notNull(),
    ...created(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.chargeId, t.branchId, t.currency],
      foreignColumns: [
        payrollCharges.organizationId,
        payrollCharges.id,
        payrollCharges.branchId,
        payrollCharges.currency,
      ],
    }),
    foreignKey({
      columns: [t.organizationId, t.expenseId],
      foreignColumns: [expenses.organizationId, expenses.id],
    }),
    unique().on(t.organizationId, t.expenseId),
    index("payroll_charge_payment_idx").on(t.organizationId, t.chargeId),
  ],
);
export const payrollRequests = gym.table(
  "payroll_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    requestKey: uuid("request_key").notNull(),
    requestHash: text("request_hash").notNull(),
    operation: text().notNull(),
    branchIds: uuid("branch_ids").array().notNull(),
    result: jsonb().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.actorId, t.requestKey),
    check("payroll_request_hash", sql`${t.requestHash} ~ '^[0-9a-f]{64}$'`),
  ],
);
