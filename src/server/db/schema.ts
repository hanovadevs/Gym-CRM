import { sql } from "drizzle-orm";
import {
  pgSchema,
  uuid,
  text,
  timestamp,
  boolean,
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
