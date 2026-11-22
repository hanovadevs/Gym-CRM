import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  integer,
  bigint,
  date,
  timestamp,
  unique,
  index,
  uniqueIndex,
  foreignKey,
  check,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { gym, organizations, members, branches, plans } from "./schema";
import { memberships } from "./membership-schema";
import { user } from "./auth-schema";
export const memberFeeAgreements = gym.table(
  "member_fee_agreements",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    memberId: uuid("member_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    planId: uuid("plan_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text().notNull(),
    startOn: date("start_on").notNull(),
    reminderDays: integer("reminder_days").notNull().default(7),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedBy: text("ended_by").references(() => user.id),
    endReason: text("end_reason"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique("member_fee_agreement_identity").on(
      t.organizationId,
      t.id,
      t.memberId,
      t.branchId,
      t.currency,
      t.amountMinor,
    ),
    uniqueIndex("member_fee_one_current")
      .on(t.organizationId, t.memberId)
      .where(sql`${t.endedAt} is null`),
    foreignKey({
      columns: [t.organizationId, t.memberId],
      foreignColumns: [members.organizationId, members.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.planId],
      foreignColumns: [plans.organizationId, plans.id],
    }),
    index("member_fee_branch_idx").on(t.organizationId, t.branchId),
    index("member_fee_plan_idx").on(t.organizationId, t.planId),
    check(
      "member_fee_values",
      sql`${t.amountMinor} between 0 and 999999999999 and ${t.currency} ~ '^[A-Z]{3}$' and ${t.reminderDays} between 1 and 30 and (${t.endedAt} is null)=(${t.endedBy} is null) and (${t.endedAt} is null)=(${t.endReason} is null) and (${t.endReason} is null or length(btrim(${t.endReason})) between 3 and 300)`,
    ),
  ],
);
export const memberFeePeriods = gym.table(
  "member_fee_periods",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    membershipId: uuid("membership_id").primaryKey(),
    agreementId: uuid("agreement_id").notNull(),
    memberId: uuid("member_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    currency: text().notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [
        t.organizationId,
        t.agreementId,
        t.memberId,
        t.branchId,
        t.currency,
        t.amountMinor,
      ],
      foreignColumns: [
        memberFeeAgreements.organizationId,
        memberFeeAgreements.id,
        memberFeeAgreements.memberId,
        memberFeeAgreements.branchId,
        memberFeeAgreements.currency,
        memberFeeAgreements.amountMinor,
      ],
    }),
    foreignKey({
      columns: [
        t.organizationId,
        t.membershipId,
        t.memberId,
        t.branchId,
        t.currency,
        t.amountMinor,
      ],
      foreignColumns: [
        memberships.organizationId,
        memberships.id,
        memberships.memberId,
        memberships.homeBranchId,
        memberships.currency,
        memberships.amountMinor,
      ],
    }),
    index("member_fee_period_agreement_idx").on(
      t.organizationId,
      t.agreementId,
    ),
    index("member_fee_period_member_idx").on(t.organizationId, t.memberId),
  ],
);

export const feeReminderSettings = gym.table(
  "fee_reminder_settings",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id),
    enabled: boolean().notNull().default(true),
    version: integer().notNull().default(1),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [check("fee_reminder_settings_version", sql`${t.version}>0`)],
);
export const feeReminderDeliveries = gym.table(
  "fee_reminder_deliveries",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    localDay: date("local_day").notNull(),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => user.id),
    recipientEmail: text("recipient_email").notNull(),
    status: text().notNull().default("queued"),
    attempts: integer().notNull().default(0),
    payload: jsonb(),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("fee_reminder_one_daily_digest").on(t.organizationId, t.localDay),
    index("fee_reminder_work_idx").on(t.status, t.createdAt),
    index("fee_reminder_recipient_idx").on(t.authUserId),
    check(
      "fee_reminder_delivery_values",
      sql`${t.status} in ('queued','sending','sent','failed','uncertain','skipped') and ${t.attempts} between 0 and 3 and length(${t.recipientEmail}) between 3 and 254 and (${t.payload} is null or jsonb_typeof(${t.payload})='object') and (${t.status}<>'sent' or ${t.sentAt} is not null)`,
    ),
  ],
);
