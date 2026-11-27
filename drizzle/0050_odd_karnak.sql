CREATE TABLE "gym"."enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"interest" text DEFAULT '' NOT NULL,
	"contact_allowed" boolean DEFAULT false NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"trial_at" timestamp with time zone,
	"assignee_id" uuid,
	"converted_member_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enquiries_organization_id_branch_id_id_unique" UNIQUE("organization_id","branch_id","id"),
	CONSTRAINT "enquiries_organization_id_converted_member_id_unique" UNIQUE("organization_id","converted_member_id"),
	CONSTRAINT "enquiry_stage" CHECK ("gym"."enquiries"."stage" in ('new','contacted','trial_booked','joined','lost') and ("gym"."enquiries"."stage"='joined') = ("gym"."enquiries"."converted_member_id" is not null) and ("gym"."enquiries"."stage"<>'trial_booked' or "gym"."enquiries"."trial_at" is not null)),
	CONSTRAINT "enquiry_details" CHECK (length(btrim("gym"."enquiries"."name")) between 1 and 120 and length("gym"."enquiries"."phone") <= 50 and length("gym"."enquiries"."email") <= 254 and length("gym"."enquiries"."interest") <= 300 and "gym"."enquiries"."version">0)
);
--> statement-breakpoint
CREATE TABLE "gym"."follow_up_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"enquiry_id" uuid NOT NULL,
	"action" text NOT NULL,
	"due_on" date NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	CONSTRAINT "follow_up_details" CHECK (length(btrim("gym"."follow_up_tasks"."action")) between 1 and 300 and ("gym"."follow_up_tasks"."completed_at" is null) = ("gym"."follow_up_tasks"."completed_by" is null))
);
--> statement-breakpoint
ALTER TABLE "gym"."enquiries" ADD CONSTRAINT "enquiries_organization_id_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "gym"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."enquiries" ADD CONSTRAINT "enquiries_organization_id_assignee_id_staff_memberships_organization_id_id_fk" FOREIGN KEY ("organization_id","assignee_id") REFERENCES "gym"."staff_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."enquiries" ADD CONSTRAINT "enquiries_organization_id_converted_member_id_members_organization_id_id_fk" FOREIGN KEY ("organization_id","converted_member_id") REFERENCES "gym"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_organization_id_branch_id_enquiry_id_enquiries_organization_id_branch_id_id_fk" FOREIGN KEY ("organization_id","branch_id","enquiry_id") REFERENCES "gym"."enquiries"("organization_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_organization_id_completed_by_staff_memberships_organization_id_id_fk" FOREIGN KEY ("organization_id","completed_by") REFERENCES "gym"."staff_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enquiries_pipeline_idx" ON "gym"."enquiries" USING btree ("organization_id","branch_id","stage","created_at");--> statement-breakpoint
CREATE INDEX "follow_up_due_idx" ON "gym"."follow_up_tasks" USING btree ("organization_id","branch_id","due_on") WHERE "gym"."follow_up_tasks"."completed_at" is null;
--> statement-breakpoint
ALTER TABLE gym.enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.follow_up_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON gym.enquiries TO gym_runtime
 USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON gym.follow_up_tasks TO gym_runtime
 USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT ON gym.enquiries,gym.follow_up_tasks TO gym_runtime;
GRANT UPDATE(name,email,phone,interest,contact_allowed,stage,trial_at,assignee_id,converted_member_id,version) ON gym.enquiries TO gym_runtime;
GRANT UPDATE(completed_at,completed_by) ON gym.follow_up_tasks TO gym_runtime;
