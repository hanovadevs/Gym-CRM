import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  integer,
  timestamp,
  unique,
  uniqueIndex,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { gym, organizations, members } from "./schema";
import { user } from "./auth-schema";
import { scheduleSlots } from "./training-schema";
export const classSessions = gym.table(
  "class_sessions",
  {
    slotId: uuid("slot_id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    branchId: uuid("branch_id").notNull(),
    trainerId: uuid("trainer_id").notNull(),
    kind: text().notNull().default("class"),
    capacity: integer().notNull(),
    version: integer().notNull().default(1),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.slotId, t.branchId),
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
    check(
      "class_values",
      sql`${t.kind}='class' and ${t.capacity} between 1 and 500 and ${t.version}>0`,
    ),
  ],
);
export const classBookings = gym.table(
  "class_bookings",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    slotId: uuid("slot_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    memberId: uuid("member_id").notNull(),
    version: integer().notNull().default(1),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by").references(() => user.id),
    cancellationReason: text("cancellation_reason").notNull().default(""),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.slotId, t.branchId],
      foreignColumns: [
        classSessions.organizationId,
        classSessions.slotId,
        classSessions.branchId,
      ],
    }),
    foreignKey({
      columns: [t.organizationId, t.memberId],
      foreignColumns: [members.organizationId, members.id],
    }),
    uniqueIndex("class_active_booking_once")
      .on(t.organizationId, t.slotId, t.memberId)
      .where(sql`${t.cancelledAt} is null`),
    index("class_booking_roster_idx").on(
      t.organizationId,
      t.slotId,
      t.createdAt,
      t.id,
    ),
    index("class_booking_member_idx").on(
      t.organizationId,
      t.memberId,
      t.slotId,
    ),
    check(
      "class_booking_values",
      sql`${t.version}>0 and ((${t.cancelledAt} is null and ${t.cancelledBy} is null and ${t.cancellationReason}='') or (${t.cancelledAt} is not null and ${t.cancelledBy} is not null and length(btrim(${t.cancellationReason})) between 3 and 300))`,
    ),
  ],
);
