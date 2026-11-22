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
