import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { branches, gym, members, staffMemberships } from "./schema";

export const enquiries = gym.table(
  "enquiries",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    name: text().notNull(),
    email: text().notNull().default(""),
    phone: text().notNull().default(""),
    interest: text().notNull().default(""),
    contactAllowed: boolean("contact_allowed").notNull().default(false),
    stage: text().notNull().default("new"),
    trialAt: timestamp("trial_at", { withTimezone: true }),
    assigneeId: uuid("assignee_id"),
    convertedMemberId: uuid("converted_member_id"),
    version: integer().notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.branchId, t.id),
    unique().on(t.organizationId, t.convertedMemberId),
    foreignKey({
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.assigneeId],
      foreignColumns: [staffMemberships.organizationId, staffMemberships.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.convertedMemberId],
      foreignColumns: [members.organizationId, members.id],
    }),
    index("enquiries_pipeline_idx").on(
      t.organizationId,
      t.branchId,
      t.stage,
      t.createdAt,
    ),
    check(
      "enquiry_stage",
      sql`${t.stage} in ('new','contacted','trial_booked','joined','lost') and (${t.stage}='joined') = (${t.convertedMemberId} is not null) and (${t.stage}<>'trial_booked' or ${t.trialAt} is not null)`,
    ),
    check(
      "enquiry_details",
      sql`length(btrim(${t.name})) between 1 and 120 and length(${t.phone}) <= 50 and length(${t.email}) <= 254 and length(${t.interest}) <= 300 and ${t.version}>0`,
    ),
  ],
);

export const followUpTasks = gym.table(
  "follow_up_tasks",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    enquiryId: uuid("enquiry_id").notNull(),
    action: text().notNull(),
    dueOn: date("due_on").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by"),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.branchId, t.enquiryId],
      foreignColumns: [
        enquiries.organizationId,
        enquiries.branchId,
        enquiries.id,
      ],
    }),
    foreignKey({
      columns: [t.organizationId, t.completedBy],
      foreignColumns: [staffMemberships.organizationId, staffMemberships.id],
    }),
    index("follow_up_due_idx")
      .on(t.organizationId, t.branchId, t.dueOn)
      .where(sql`${t.completedAt} is null`),
    check(
      "follow_up_details",
      sql`length(btrim(${t.action})) between 1 and 300 and (${t.completedAt} is null) = (${t.completedBy} is null)`,
    ),
  ],
);
