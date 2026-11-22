import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  timestamp,
  jsonb,
  unique,
  uniqueIndex,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { gym, organizations, branches, members } from "./schema";
import { user } from "./auth-schema";
import { memberships } from "./membership-schema";

export const attendanceVisits = gym.table(
  "attendance_visits",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    memberId: uuid("member_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    membershipId: uuid("membership_id"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true })
      .default(sql`clock_timestamp()`)
      .notNull(),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    checkedInBy: text("checked_in_by")
      .notNull()
      .references(() => user.id),
    checkedOutBy: text("checked_out_by").references(() => user.id),
    eligibilitySnapshot: jsonb("eligibility_snapshot").notNull(),
    overrideActorId: text("override_actor_id").references(() => user.id),
    overrideReason: text("override_reason").notNull().default(""),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.memberId],
      foreignColumns: [members.organizationId, members.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.membershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    uniqueIndex("one_open_visit_per_member")
      .on(t.organizationId, t.memberId)
      .where(sql`${t.checkedOutAt} is null`),
    index("attendance_branch_time_idx").on(
      t.organizationId,
      t.branchId,
      t.checkedInAt,
      t.id,
    ),
    index("attendance_member_time_idx").on(
      t.organizationId,
      t.memberId,
      t.checkedInAt,
      t.id,
    ),
    check(
      "attendance_exit_consistent",
      sql`(${t.checkedOutAt} is null)=(${t.checkedOutBy} is null) and (${t.checkedOutAt} is null or ${t.checkedOutAt}>=${t.checkedInAt})`,
    ),
    check(
      "attendance_override_reason",
      sql`(${t.overrideActorId} is null and ${t.overrideReason}='') or (${t.overrideActorId} is not null and length(btrim(${t.overrideReason})) between 3 and 300)`,
    ),
    check(
      "attendance_eligibility_snapshot",
      sql`jsonb_typeof(${t.eligibilitySnapshot})='object' and ${t.eligibilitySnapshot} ?& ARRAY['allowed','reason'] and jsonb_typeof(${t.eligibilitySnapshot}->'allowed')='boolean' and jsonb_typeof(${t.eligibilitySnapshot}->'reason')='string' and ((${t.eligibilitySnapshot}->>'allowed')::boolean or ${t.overrideActorId} is not null)`,
    ),
  ],
);
export const attendanceRequests = gym.table(
  "attendance_requests",
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
    branchId: uuid("branch_id").notNull(),
    memberId: uuid("member_id").notNull(),
    visitId: uuid("visit_id").notNull(),
    result: jsonb().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique().on(t.organizationId, t.actorId, t.requestKey),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.memberId],
      foreignColumns: [members.organizationId, members.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.visitId],
      foreignColumns: [attendanceVisits.organizationId, attendanceVisits.id],
    }),
    index("attendance_request_visit_idx").on(t.organizationId, t.visitId),
    check(
      "attendance_request_values",
      sql`${t.operation} in ('check_in','check_out') and ${t.requestHash} ~ '^[0-9a-f]{64}$' and jsonb_typeof(${t.result})='object'`,
    ),
  ],
);
export const memberAccessTokens = gym.table(
  "member_access_tokens",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    memberId: uuid("member_id").notNull(),
    token: uuid().defaultRandom().notNull().unique(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique().on(t.organizationId, t.memberId),
    foreignKey({
      columns: [t.organizationId, t.memberId],
      foreignColumns: [members.organizationId, members.id],
    }),
  ],
);
