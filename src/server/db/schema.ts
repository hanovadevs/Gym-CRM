import { sql } from "drizzle-orm";
import {
  pgSchema,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  date,
  jsonb,
  index,
  unique,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
export const gym = pgSchema("gym");
export const organizations = gym.table("organizations", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  phone: text().notNull().default(""),
  email: text().notNull().default(""),
  address: text().notNull().default(""),
  receiptPrefix: text("receipt_prefix").notNull().default("GYM"),
  receiptFooter: text("receipt_footer")
    .notNull()
    .default("Thank you for training with us."),
  graceDays: integer("grace_days").notNull().default(0),
  debtBlocksAccess: boolean("debt_blocks_access").notNull().default(false),
  paidActivation: boolean("paid_activation").notNull().default(true),
  settingsVersion: integer("settings_version").notNull().default(1),
  currency: text().notNull().default("PKR"),
  timeZone: text("time_zone").notNull().default("Asia/Karachi"),
  locale: text().notNull().default("en-PK"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const branches = gym.table(
  "branches",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text().notNull(),
    name: text().notNull(),
    active: boolean().notNull().default(true),
    version: integer().notNull().default(1),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.code),
  ],
);
export const staffMemberships = gym.table(
  "staff_memberships",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => user.id),
    role: text().notNull(),
    active: boolean().notNull().default(true),
    version: integer().notNull().default(1),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.authUserId),
    check(
      "staff_role_check",
      sql`${t.role} in ('owner','manager','receptionist','trainer','accountant')`,
    ),
  ],
);
export const staffBranchGrants = gym.table(
  "staff_branch_grants",
  {
    organizationId: uuid("organization_id").notNull(),
    staffMembershipId: uuid("staff_membership_id").notNull(),
    branchId: uuid("branch_id").notNull(),
  },
  (t) => [
    unique().on(t.organizationId, t.staffMembershipId, t.branchId),
    foreignKey({
      columns: [t.organizationId, t.staffMembershipId],
      foreignColumns: [staffMemberships.organizationId, staffMemberships.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
  ],
);

export const auditEvents = gym.table(
  "audit_events",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id),
    action: text().notNull(),
    entityId: uuid("entity_id").notNull(),
    requestId: uuid("request_id").notNull(),
    reason: text().notNull(),
    before: jsonb(),
    after: jsonb(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_events_org_time_idx").on(t.organizationId, t.occurredAt),
  ],
);

export const numberCounters = gym.table(
  "number_counters",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    kind: text().notNull(),
    value: bigint({ mode: "bigint" }).notNull(),
  },
  (t) => [
    unique().on(t.organizationId, t.kind),
    check("counter_positive", sql`${t.value}>0`),
  ],
);

export const members = gym.table(
  "members",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    homeBranchId: uuid("home_branch_id").notNull(),
    memberCode: text("member_code").notNull(),
    name: text().notNull(),
    phone: text().notNull().default(""),
    normalizedPhone: text("normalized_phone").notNull().default(""),
    email: text().notNull().default(""),
    joinedOn: date("joined_on", { mode: "string" }).notNull(),
    version: integer().notNull().default(1),
    registrationKey: uuid("registration_key").notNull(),
    registrationHash: text("registration_hash").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.memberCode),
    unique().on(t.organizationId, t.createdBy, t.registrationKey),
    foreignKey({
      columns: [t.organizationId, t.homeBranchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    index("members_org_branch_name_idx").on(
      t.organizationId,
      t.homeBranchId,
      t.name,
      t.id,
    ),
    index("members_org_phone_idx").on(t.organizationId, t.normalizedPhone),
    index("members_org_email_idx").on(t.organizationId, t.email),
    check(
      "member_valid_version_name",
      sql`${t.version}>0 and length(btrim(${t.name})) between 1 and 100`,
    ),
    check(
      "member_contact_required",
      sql`${t.normalizedPhone}<>'' or ${t.email}<>''`,
    ),
    check(
      "member_phone_normalized",
      sql`${t.normalizedPhone}=regexp_replace(${t.phone},'[^0-9]','','g') and (${t.normalizedPhone}='' or ${t.normalizedPhone} ~ '^[0-9]{7,15}$')`,
    ),
  ],
);
