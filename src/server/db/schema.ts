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
import { user, appAuth } from "./auth-schema";
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

export const memberContacts = gym.table(
  "member_contacts",
  {
    organizationId: uuid("organization_id").notNull(),
    memberId: uuid("member_id").notNull(),
    name: text().notNull(),
    phone: text().notNull(),
    relationship: text().notNull().default(""),
  },
  (t) => [
    unique().on(t.organizationId, t.memberId),
    foreignKey({
      columns: [t.organizationId, t.memberId],
      foreignColumns: [members.organizationId, members.id],
    }),
    check(
      "emergency_contact_present",
      sql`length(btrim(${t.name})) between 1 and 100 and length(regexp_replace(${t.phone},'[^0-9]','','g')) between 7 and 15`,
    ),
  ],
);
export const memberNotes = gym.table(
  "member_notes",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    memberId: uuid("member_id").notNull(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id),
    visibility: text().notNull(),
    body: text().notNull(),
    requestKey: uuid("request_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.authorUserId, t.requestKey),
    foreignKey({
      columns: [t.organizationId, t.memberId],
      foreignColumns: [members.organizationId, members.id],
    }),
    index("member_notes_member_time_idx").on(
      t.organizationId,
      t.memberId,
      t.createdAt,
      t.id,
    ),
    index("member_notes_author_idx").on(t.authorUserId),
    check(
      "member_note_bounds",
      sql`length(btrim(${t.body})) between 1 and 2000 and ${t.visibility} in ('operational','management')`,
    ),
  ],
);
export const noteWithdrawals = gym.table(
  "member_note_withdrawals",
  {
    organizationId: uuid("organization_id").notNull(),
    noteId: uuid("note_id").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id),
    reason: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique().on(t.organizationId, t.noteId),
    foreignKey({
      columns: [t.organizationId, t.noteId],
      foreignColumns: [memberNotes.organizationId, memberNotes.id],
    }),
    index("note_withdrawals_actor_idx").on(t.actorUserId),
  ],
);
export const mailOutbox = appAuth.table(
  "mail_outbox",
  {
    id: uuid().defaultRandom().primaryKey(),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => user.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    kind: text().notNull(),
    payload: jsonb(),
    status: text().notNull().default("pending"),
    messageId: text("message_id"),
    errorCode: text("error_code"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("mail_outbox_pending_idx").on(t.status, t.createdAt),
    index("mail_outbox_user_idx").on(t.authUserId),
    index("mail_outbox_org_idx").on(t.organizationId),
    check(
      "mail_kind_status",
      sql`${t.kind} in ('recovery','invitation') and ${t.status} in ('pending','sending','sent','failed','uncertain','expired')`,
    ),
  ],
);

export const plans = gym.table(
  "plans",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    branchId: uuid("branch_id").notNull(),
    code: text().notNull(),
    revision: integer().notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.code),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    index("plans_branch_idx").on(t.organizationId, t.branchId, t.archivedAt),
    index("plans_creator_idx").on(t.createdBy),
    check(
      "plan_identity",
      sql`${t.code} ~ '^[A-Z0-9][A-Z0-9-]{0,23}$' and ${t.revision}>0`,
    ),
  ],
);
export const planVersions = gym.table(
  "plan_versions",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    planId: uuid("plan_id").notNull(),
    version: integer().notNull(),
    name: text().notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text().notNull(),
    durationUnit: text("duration_unit").notNull(),
    durationCount: integer("duration_count").notNull(),
    accessMode: text("access_mode").notNull(),
    gymFloor: boolean("gym_floor").notNull(),
    classes: boolean().notNull(),
    personalTraining: boolean("personal_training").notNull(),
    reason: text().notNull(),
    requestKey: uuid("request_key").notNull(),
    requestHash: text("request_hash").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.planId, t.version),
    unique().on(t.organizationId, t.createdBy, t.requestKey),
    foreignKey({
      columns: [t.organizationId, t.planId],
      foreignColumns: [plans.organizationId, plans.id],
    }),
    index("plan_versions_creator_idx").on(t.createdBy),
    check(
      "plan_version_values",
      sql`${t.version}>0 and length(btrim(${t.name})) between 1 and 100 and ${t.amountMinor} between 0 and 999999999999 and ${t.currency} ~ '^[A-Z]{3}$' and ((${t.durationUnit}='months' and ${t.durationCount} between 1 and 120) or (${t.durationUnit}='days' and ${t.durationCount} between 1 and 3650)) and ${t.accessMode} in ('home_branch','all_branches') and (${t.gymFloor} or ${t.classes} or ${t.personalTraining}) and length(btrim(${t.reason})) between 3 and 300`,
    ),
  ],
);
