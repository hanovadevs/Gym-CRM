import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  unique,
  uniqueIndex,
  index,
  primaryKey,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { gym, organizations, branches, members } from "./schema";
import { user } from "./auth-schema";
const actors = () => ({
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
});
export const trainers = gym.table(
  "trainers",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text().notNull(),
    specialties: text().notNull().default(""),
    phone: text().notNull().default(""),
    email: text().notNull().default(""),
    loginUserId: text("login_user_id").references(() => user.id),
    active: boolean().default(true).notNull(),
    version: integer().default(1).notNull(),
    ...actors(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    uniqueIndex("trainer_login_once")
      .on(t.organizationId, t.loginUserId)
      .where(sql`${t.loginUserId} is not null`),
    index("trainer_directory_idx").on(t.organizationId, t.name, t.id),
    check(
      "trainer_values",
      sql`length(btrim(${t.name})) between 2 and 100 and length(${t.specialties})<=200 and length(${t.phone})<=50 and length(${t.email})<=254 and ${t.version}>0`,
    ),
  ],
);
export const trainerBranches = gym.table(
  "trainer_branches",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    trainerId: uuid("trainer_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    active: boolean().default(true).notNull(),
    version: integer().default(1).notNull(),
    ...actors(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.trainerId, t.branchId] }),
    foreignKey({
      columns: [t.organizationId, t.trainerId],
      foreignColumns: [trainers.organizationId, trainers.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    index("trainer_branch_directory_idx").on(
      t.organizationId,
      t.branchId,
      t.trainerId,
    ),
    check("trainer_branch_version", sql`${t.version}>0`),
  ],
);
export const trainerAssignments = gym.table(
  "trainer_assignments",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    trainerId: uuid("trainer_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    memberId: uuid("member_id").notNull(),
    startOn: date("start_on").notNull(),
    endOn: date("end_on_exclusive"),
    active: boolean().default(true).notNull(),
    version: integer().default(1).notNull(),
    ...actors(),
  },
  (t) => [
    unique("training_assignment_identity").on(
      t.organizationId,
      t.id,
      t.branchId,
      t.trainerId,
      t.memberId,
    ),
    foreignKey({
      columns: [t.organizationId, t.trainerId, t.branchId],
      foreignColumns: [
        trainerBranches.organizationId,
        trainerBranches.trainerId,
        trainerBranches.branchId,
      ],
    }),
    foreignKey({
      columns: [t.organizationId, t.memberId],
      foreignColumns: [members.organizationId, members.id],
    }),
    index("trainer_assignment_member_idx").on(
      t.organizationId,
      t.memberId,
      t.startOn,
    ),
    index("trainer_assignment_branch_idx").on(
      t.organizationId,
      t.branchId,
      t.trainerId,
      t.startOn,
    ),
    check(
      "trainer_assignment_dates",
      sql`(${t.endOn} is null or ${t.endOn}>${t.startOn}) and ${t.version}>0`,
    ),
  ],
);
export const trainerAvailability = gym.table(
  "trainer_availability",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    trainerId: uuid("trainer_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    weekday: integer().notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    active: boolean().default(true).notNull(),
    version: integer().default(1).notNull(),
    ...actors(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.trainerId, t.branchId],
      foreignColumns: [
        trainerBranches.organizationId,
        trainerBranches.trainerId,
        trainerBranches.branchId,
      ],
    }),
    index("trainer_availability_lookup_idx").on(
      t.organizationId,
      t.trainerId,
      t.branchId,
      t.weekday,
    ),
    check(
      "trainer_availability_values",
      sql`${t.weekday} between 0 and 6 and ${t.startMinute}>=0 and ${t.endMinute}<=1440 and ${t.endMinute}>${t.startMinute} and ${t.version}>0`,
    ),
  ],
);
export const scheduleRooms = gym.table(
  "schedule_rooms",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    branchId: uuid("branch_id").notNull(),
    name: text().notNull(),
    normalizedName: text("normalized_name").notNull(),
    capacity: integer().notNull(),
    active: boolean().default(true).notNull(),
    version: integer().default(1).notNull(),
    ...actors(),
  },
  (t) => [
    unique().on(t.organizationId, t.id, t.branchId),
    unique().on(t.organizationId, t.branchId, t.normalizedName),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    check(
      "schedule_room_values",
      sql`length(btrim(${t.name})) between 1 and 80 and ${t.normalizedName}=lower(btrim(${t.name})) and ${t.capacity} between 1 and 500 and ${t.version}>0`,
    ),
  ],
);
export const scheduleSlots = gym.table(
  "schedule_slots",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    branchId: uuid("branch_id").notNull(),
    trainerId: uuid("trainer_id").notNull(),
    roomId: uuid("room_id"),
    kind: text().default("pt").notNull(),
    title: text().notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by").references(() => user.id),
    cancellationReason: text("cancellation_reason").default("").notNull(),
    version: integer().default(1).notNull(),
    ...actors(),
  },
  (t) => [
    unique("schedule_slot_identity").on(
      t.organizationId,
      t.id,
      t.branchId,
      t.trainerId,
      t.kind,
    ),
    foreignKey({
      columns: [t.organizationId, t.trainerId, t.branchId],
      foreignColumns: [
        trainerBranches.organizationId,
        trainerBranches.trainerId,
        trainerBranches.branchId,
      ],
    }),
    foreignKey({
      columns: [t.organizationId, t.roomId, t.branchId],
      foreignColumns: [
        scheduleRooms.organizationId,
        scheduleRooms.id,
        scheduleRooms.branchId,
      ],
    }),
    index("schedule_branch_time_idx").on(
      t.organizationId,
      t.branchId,
      t.startsAt,
      t.id,
    ),
    index("schedule_trainer_time_idx").on(
      t.organizationId,
      t.trainerId,
      t.startsAt,
      t.endsAt,
    ),
    index("schedule_room_time_idx").on(
      t.organizationId,
      t.roomId,
      t.startsAt,
      t.endsAt,
    ),
    check("schedule_slot_kind", sql`${t.kind}='pt'`),
    check(
      "schedule_slot_values",
      sql`${t.endsAt}>${t.startsAt} and ${t.endsAt}<=${t.startsAt}+interval '24 hours' and length(btrim(${t.title})) between 3 and 120 and ${t.version}>0 and ((${t.cancelledAt} is null and ${t.cancelledBy} is null and ${t.cancellationReason}='') or (${t.cancelledAt} is not null and ${t.cancelledBy} is not null and length(btrim(${t.cancellationReason})) between 3 and 300))`,
    ),
  ],
);
export const personalSessions = gym.table(
  "personal_sessions",
  {
    slotId: uuid("slot_id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    branchId: uuid("branch_id").notNull(),
    trainerId: uuid("trainer_id").notNull(),
    memberId: uuid("member_id").notNull(),
    assignmentId: uuid("assignment_id").notNull(),
    kind: text().default("pt").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.slotId, t.branchId, t.trainerId, t.kind],
      foreignColumns: [
        scheduleSlots.organizationId,
        scheduleSlots.id,
        scheduleSlots.branchId,
        scheduleSlots.trainerId,
        scheduleSlots.kind,
      ],
    }),
    foreignKey({
      columns: [
        t.organizationId,
        t.assignmentId,
        t.branchId,
        t.trainerId,
        t.memberId,
      ],
      foreignColumns: [
        trainerAssignments.organizationId,
        trainerAssignments.id,
        trainerAssignments.branchId,
        trainerAssignments.trainerId,
        trainerAssignments.memberId,
      ],
    }),
    index("personal_session_member_idx").on(
      t.organizationId,
      t.memberId,
      t.slotId,
    ),
    check("personal_session_kind", sql`${t.kind}='pt'`),
  ],
);
export const scheduleRequests = gym.table(
  "schedule_requests",
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
    branchIds: uuid("branch_ids").array().notNull(),
    result: jsonb().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique().on(t.organizationId, t.actorId, t.requestKey),
    check(
      "schedule_request_values",
      sql`${t.requestHash} ~ '^[0-9a-f]{64}$' and ${t.operation} ~ '^[a-z_.]{1,40}$' and cardinality(${t.branchIds})>0 and array_position(${t.branchIds},NULL) is null and jsonb_typeof(${t.result})='object'`,
    ),
  ],
);
