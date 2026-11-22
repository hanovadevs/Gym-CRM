import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  integer,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { gym, organizations } from "./schema";
import { user } from "./auth-schema";
export const gymAccounts = gym.table(
  "gym_accounts",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id),
    authUserId: text("auth_user_id")
      .notNull()
      .unique()
      .references(() => user.id),
    ownerEmail: text("owner_email"),
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
    index("gym_owner_recovery_idx").on(t.ownerEmail, t.organizationId),
    check(
      "gym_account_values",
      sql`${t.version}>0 and (${t.ownerEmail} is null or (length(${t.ownerEmail}) between 3 and 254 and ${t.ownerEmail}=lower(btrim(${t.ownerEmail})) and ${t.ownerEmail} ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'))`,
    ),
  ],
);
