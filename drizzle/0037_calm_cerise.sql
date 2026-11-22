CREATE TABLE "gym"."class_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancellation_reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "class_booking_values" CHECK ("gym"."class_bookings"."version">0 and (("gym"."class_bookings"."cancelled_at" is null and "gym"."class_bookings"."cancelled_by" is null and "gym"."class_bookings"."cancellation_reason"='') or ("gym"."class_bookings"."cancelled_at" is not null and "gym"."class_bookings"."cancelled_by" is not null and length(btrim("gym"."class_bookings"."cancellation_reason")) between 3 and 300)))
);
--> statement-breakpoint
CREATE TABLE "gym"."class_sessions" (
	"slot_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"trainer_id" uuid NOT NULL,
	"kind" text DEFAULT 'class' NOT NULL,
	"capacity" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_sessions_organization_id_slot_id_branch_id_unique" UNIQUE("organization_id","slot_id","branch_id"),
	CONSTRAINT "class_values" CHECK ("gym"."class_sessions"."kind"='class' and "gym"."class_sessions"."capacity" between 1 and 500 and "gym"."class_sessions"."version">0)
);
--> statement-breakpoint
ALTER TABLE "gym"."schedule_slots" DROP CONSTRAINT "schedule_slot_kind";--> statement-breakpoint
ALTER TABLE "gym"."class_bookings" ADD CONSTRAINT "class_bookings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."class_bookings" ADD CONSTRAINT "class_bookings_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."class_bookings" ADD CONSTRAINT "class_bookings_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."class_bookings" ADD CONSTRAINT "class_bookings_organization_id_slot_id_branch_id_class_sessions_organization_id_slot_id_branch_id_fk" FOREIGN KEY ("organization_id","slot_id","branch_id") REFERENCES "gym"."class_sessions"("organization_id","slot_id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."class_bookings" ADD CONSTRAINT "class_bookings_organization_id_member_id_members_organization_id_id_fk" FOREIGN KEY ("organization_id","member_id") REFERENCES "gym"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."class_sessions" ADD CONSTRAINT "class_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."class_sessions" ADD CONSTRAINT "class_sessions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."class_sessions" ADD CONSTRAINT "class_sessions_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."class_sessions" ADD CONSTRAINT "class_sessions_organization_id_slot_id_branch_id_trainer_id_kind_schedule_slots_organization_id_id_branch_id_trainer_id_kind_fk" FOREIGN KEY ("organization_id","slot_id","branch_id","trainer_id","kind") REFERENCES "gym"."schedule_slots"("organization_id","id","branch_id","trainer_id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_active_booking_once" ON "gym"."class_bookings" USING btree ("organization_id","slot_id","member_id") WHERE "gym"."class_bookings"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "class_booking_roster_idx" ON "gym"."class_bookings" USING btree ("organization_id","slot_id","created_at","id");--> statement-breakpoint
CREATE INDEX "class_booking_member_idx" ON "gym"."class_bookings" USING btree ("organization_id","member_id","slot_id");--> statement-breakpoint
ALTER TABLE "gym"."schedule_slots" ADD CONSTRAINT "schedule_slot_kind" CHECK ("gym"."schedule_slots"."kind" in ('pt','class'));