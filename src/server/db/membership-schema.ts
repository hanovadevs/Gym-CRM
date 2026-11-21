import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  integer,
  bigint,
  date,
  timestamp,
  jsonb,
  unique,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { gym, organizations, members, branches, planVersions } from "./schema";
import { user } from "./auth-schema";
export const memberships = gym.table(
  "memberships",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    memberId: uuid("member_id").notNull(),
    homeBranchId: uuid("home_branch_id").notNull(),
    planVersionId: uuid("plan_version_id").notNull(),
    snapshot: jsonb().notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text().notNull(),
    startOn: date("start_on").notNull(),
    originalEndOn: date("original_end_on_exclusive").notNull(),
    endOn: date("end_on_exclusive").notNull(),
    lifecycle: text().notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    cancelledEffectiveOn: date("cancelled_effective_on"),
    version: integer().notNull().default(1),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique("membership_invoice_identity").on(
      t.organizationId,
      t.id,
      t.memberId,
      t.homeBranchId,
      t.currency,
      t.amountMinor,
    ),
    foreignKey({
      columns: [t.organizationId, t.memberId],
      foreignColumns: [members.organizationId, members.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.homeBranchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.planVersionId],
      foreignColumns: [planVersions.organizationId, planVersions.id],
    }),
    index("memberships_member_period_idx").on(
      t.organizationId,
      t.memberId,
      t.startOn,
      t.endOn,
    ),
    index("memberships_branch_idx").on(t.organizationId, t.homeBranchId),
    index("memberships_plan_idx").on(t.organizationId, t.planVersionId),
    index("memberships_actor_idx").on(t.createdBy),
    check('membership_snapshot_shape',sql`coalesce(${t.snapshot} ?& array['planId','planVersionId','planCode','planVersion','branchId','name','amountMinor','currency','durationUnit','durationCount','accessMode','gymFloor','classes','personalTraining'] and jsonb_typeof(${t.snapshot}->'amountMinor')='number' and jsonb_typeof(${t.snapshot}->'currency')='string' and (${t.snapshot}->>'currency') ~ '^[A-Z]{3}$' and jsonb_typeof(${t.snapshot}->'planVersionId')='string' and (${t.snapshot}->>'planId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and (${t.snapshot}->>'branchId')=${t.homeBranchId}::text and (${t.snapshot}->>'planVersion') ~ '^[1-9][0-9]*$' and (${t.snapshot}->>'planCode') ~ '^[A-Z0-9][A-Z0-9-]{0,23}$' and jsonb_typeof(${t.snapshot}->'name')='string' and length(btrim(${t.snapshot}->>'name')) between 1 and 100 and (${t.snapshot}->>'accessMode') in ('home_branch','all_branches') and jsonb_typeof(${t.snapshot}->'gymFloor')='boolean' and jsonb_typeof(${t.snapshot}->'classes')='boolean' and jsonb_typeof(${t.snapshot}->'personalTraining')='boolean' and ((${t.snapshot}->>'gymFloor')::boolean or (${t.snapshot}->>'classes')::boolean or (${t.snapshot}->>'personalTraining')::boolean) and (((${t.snapshot}->>'durationUnit')='months' and (${t.snapshot}->>'durationCount')::int between 1 and 120) or ((${t.snapshot}->>'durationUnit')='days' and (${t.snapshot}->>'durationCount')::int between 1 and 3650)),false)`),
    check(
      "membership_values",
      sql`${t.endOn}>${t.startOn} and ${t.originalEndOn}>${t.startOn} and ${t.endOn}>=${t.originalEndOn} and ${t.amountMinor} between 0 and 999999999999 and ${t.version}>0 and ${t.lifecycle} in ('pending','active','cancelled') and (${t.lifecycle}<>'active' or ${t.activatedAt} is not null) and ((${t.lifecycle}='cancelled')=(${t.cancelledEffectiveOn} is not null)) and (${t.cancelledEffectiveOn} is null or ${t.cancelledEffectiveOn}<=${t.endOn}) and jsonb_typeof(${t.snapshot})='object' and (${t.snapshot}->>'planVersionId')=${t.planVersionId}::text and (${t.snapshot}->>'currency')=${t.currency} and (${t.snapshot}->>'amountMinor')::bigint=${t.amountMinor}`,
    ),
  ],
);
export const membershipFreezes = gym.table(
  "membership_freezes",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    membershipId: uuid("membership_id").notNull(),
    startOn: date("start_on").notNull(),
    endOn: date("end_on_exclusive").notNull(),
    extensionDays: integer("extension_days").notNull(),
    reason: text().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedBy: text("reversed_by").references(() => user.id),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.membershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    index("freezes_membership_idx").on(t.organizationId, t.membershipId),
    index("freezes_actor_idx").on(t.createdBy),
    index("freezes_reversed_actor_idx").on(t.reversedBy),
    check(
      "freeze_dates",
      sql`${t.endOn}>${t.startOn} and ${t.extensionDays}=(${t.endOn}-${t.startOn}) and length(btrim(${t.reason})) between 3 and 300 and ((${t.reversedAt} is null)=(${t.reversedBy} is null))`,
    ),
  ],
);
export const invoices = gym.table(
  "invoices",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    membershipId: uuid("membership_id").notNull(),
    memberId: uuid("member_id").notNull(),
    originatingBranchId: uuid("originating_branch_id").notNull(),
    number: text().notNull(),
    description: text().notNull(),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    currency: text().notNull(),
    issuedOn: date("issued_on").notNull(),
    dueOn: date("due_on").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.number),
    unique().on(t.organizationId, t.membershipId),
    foreignKey({
      columns: [
        t.organizationId,
        t.membershipId,
        t.memberId,
        t.originatingBranchId,
        t.currency,
        t.totalMinor,
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
    index("invoices_member_idx").on(t.organizationId, t.memberId),
    index("invoices_branch_date_idx").on(
      t.organizationId,
      t.originatingBranchId,
      t.issuedOn,
    ),
    index("invoices_actor_idx").on(t.createdBy),
    check(
      "invoice_values",
      sql`${t.totalMinor} between 0 and 999999999999 and ${t.dueOn}>=${t.issuedOn} and length(btrim(${t.description})) between 1 and 100`,
    ),
  ],
);
export const membershipRequests = gym.table(
  "membership_requests",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    memberId: uuid("member_id").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    operation: text().notNull(),
    requestKey: uuid("request_key").notNull(),
    requestHash: text("request_hash").notNull(),
    result: jsonb().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.actorId, t.operation, t.requestKey),
    foreignKey({
      columns: [t.organizationId, t.memberId],
      foreignColumns: [members.organizationId, members.id],
    }),
    index("membership_requests_member_idx").on(t.organizationId, t.memberId),
    index("membership_requests_actor_idx").on(t.actorId),
    check(
      "membership_operation",
      sql`${t.operation} in ('enroll','renew','activate','freeze','reverse_freeze','cancel')`,
    ),
  ],
);
