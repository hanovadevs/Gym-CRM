import { sql } from "drizzle-orm";
import {
  pgSchema,
  text,
  boolean,
  timestamp,
  uuid,
  jsonb,
  unique,
  index,
  check,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { organizations } from "./schema";
export const platform = pgSchema("platform");
export const platformAdministrators = platform.table("administrators", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id),
  active: boolean().notNull().default(true),
  reason: text().notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const platformEvents = platform.table(
  "events",
  {
    id: uuid().defaultRandom().primaryKey(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    action: text().notNull(),
    reason: text().notNull(),
    requestKey: uuid("request_key").notNull(),
    requestHash: text("request_hash").notNull(),
    before: jsonb(),
    after: jsonb().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique().on(t.actorUserId, t.requestKey),
    index("platform_events_time_idx").on(t.occurredAt),
    check(
      "platform_event_action",
      sql`${t.action} in ('gym.created','gym.updated')`,
    ),
  ],
);
