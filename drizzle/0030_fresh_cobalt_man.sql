CREATE TABLE "gym"."personal_sessions" (
	"slot_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"trainer_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"kind" text DEFAULT 'pt' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_session_kind" CHECK ("gym"."personal_sessions"."kind"='pt')
);
--> statement-breakpoint
CREATE TABLE "gym"."schedule_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"operation" text NOT NULL,
	"branch_ids" uuid[] NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_requests_organization_id_actor_id_request_key_unique" UNIQUE("organization_id","actor_id","request_key"),
	CONSTRAINT "schedule_request_values" CHECK ("gym"."schedule_requests"."request_hash" ~ '^[0-9a-f]{64}$' and "gym"."schedule_requests"."operation" ~ '^[a-z_.]{1,40}$' and cardinality("gym"."schedule_requests"."branch_ids")>0 and array_position("gym"."schedule_requests"."branch_ids",NULL) is null and jsonb_typeof("gym"."schedule_requests"."result")='object')
);
--> statement-breakpoint
CREATE TABLE "gym"."schedule_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"capacity" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_rooms_organization_id_id_branch_id_unique" UNIQUE("organization_id","id","branch_id"),
	CONSTRAINT "schedule_rooms_organization_id_branch_id_normalized_name_unique" UNIQUE("organization_id","branch_id","normalized_name"),
	CONSTRAINT "schedule_room_values" CHECK (length(btrim("gym"."schedule_rooms"."name")) between 1 and 80 and "gym"."schedule_rooms"."normalized_name"=lower(btrim("gym"."schedule_rooms"."name")) and "gym"."schedule_rooms"."capacity" between 1 and 500 and "gym"."schedule_rooms"."version">0)
);
--> statement-breakpoint
CREATE TABLE "gym"."schedule_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"trainer_id" uuid NOT NULL,
	"room_id" uuid,
	"kind" text DEFAULT 'pt' NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancellation_reason" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_slot_identity" UNIQUE("organization_id","id","branch_id","trainer_id","kind"),
	CONSTRAINT "schedule_slot_kind" CHECK ("gym"."schedule_slots"."kind"='pt'),
	CONSTRAINT "schedule_slot_values" CHECK ("gym"."schedule_slots"."ends_at">"gym"."schedule_slots"."starts_at" and "gym"."schedule_slots"."ends_at"<="gym"."schedule_slots"."starts_at"+interval '24 hours' and length(btrim("gym"."schedule_slots"."title")) between 3 and 120 and "gym"."schedule_slots"."version">0 and (("gym"."schedule_slots"."cancelled_at" is null and "gym"."schedule_slots"."cancelled_by" is null and "gym"."schedule_slots"."cancellation_reason"='') or ("gym"."schedule_slots"."cancelled_at" is not null and "gym"."schedule_slots"."cancelled_by" is not null and length(btrim("gym"."schedule_slots"."cancellation_reason")) between 3 and 300)))
);
--> statement-breakpoint
CREATE TABLE "gym"."trainer_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trainer_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"start_on" date NOT NULL,
	"end_on_exclusive" date,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_assignment_identity" UNIQUE("organization_id","id","branch_id","trainer_id","member_id"),
	CONSTRAINT "trainer_assignment_dates" CHECK (("gym"."trainer_assignments"."end_on_exclusive" is null or "gym"."trainer_assignments"."end_on_exclusive">"gym"."trainer_assignments"."start_on") and "gym"."trainer_assignments"."version">0)
);
--> statement-breakpoint
CREATE TABLE "gym"."trainer_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trainer_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trainer_availability_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "trainer_availability_values" CHECK ("gym"."trainer_availability"."weekday" between 0 and 6 and "gym"."trainer_availability"."start_minute">=0 and "gym"."trainer_availability"."end_minute"<=1440 and "gym"."trainer_availability"."end_minute">"gym"."trainer_availability"."start_minute" and "gym"."trainer_availability"."version">0)
);
--> statement-breakpoint
CREATE TABLE "gym"."trainer_branches" (
	"organization_id" uuid NOT NULL,
	"trainer_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trainer_branches_organization_id_trainer_id_branch_id_pk" PRIMARY KEY("organization_id","trainer_id","branch_id"),
	CONSTRAINT "trainer_branch_version" CHECK ("gym"."trainer_branches"."version">0)
);
--> statement-breakpoint
CREATE TABLE "gym"."trainers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"specialties" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"login_user_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trainers_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "trainer_values" CHECK (length(btrim("gym"."trainers"."name")) between 2 and 100 and length("gym"."trainers"."specialties")<=200 and length("gym"."trainers"."phone")<=50 and length("gym"."trainers"."email")<=254 and "gym"."trainers"."version">0)
);
--> statement-breakpoint
ALTER TABLE "gym"."personal_sessions" ADD CONSTRAINT "personal_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."personal_sessions" ADD CONSTRAINT "personal_sessions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."personal_sessions" ADD CONSTRAINT "personal_sessions_organization_id_slot_id_branch_id_trainer_id_kind_schedule_slots_organization_id_id_branch_id_trainer_id_kind_fk" FOREIGN KEY ("organization_id","slot_id","branch_id","trainer_id","kind") REFERENCES "gym"."schedule_slots"("organization_id","id","branch_id","trainer_id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."personal_sessions" ADD CONSTRAINT "personal_sessions_organization_id_assignment_id_branch_id_trainer_id_member_id_trainer_assignments_organization_id_id_branch_id_trainer_id_member_id_fk" FOREIGN KEY ("organization_id","assignment_id","branch_id","trainer_id","member_id") REFERENCES "gym"."trainer_assignments"("organization_id","id","branch_id","trainer_id","member_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."schedule_requests" ADD CONSTRAINT "schedule_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."schedule_requests" ADD CONSTRAINT "schedule_requests_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."schedule_rooms" ADD CONSTRAINT "schedule_rooms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."schedule_rooms" ADD CONSTRAINT "schedule_rooms_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."schedule_rooms" ADD CONSTRAINT "schedule_rooms_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."schedule_rooms" ADD CONSTRAINT "schedule_rooms_organization_id_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "gym"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."schedule_slots" ADD CONSTRAINT "schedule_slots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."schedule_slots" ADD CONSTRAINT "schedule_slots_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."schedule_slots" ADD CONSTRAINT "schedule_slots_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."schedule_slots" ADD CONSTRAINT "schedule_slots_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."schedule_slots" ADD CONSTRAINT "schedule_slots_organization_id_trainer_id_branch_id_trainer_branches_organization_id_trainer_id_branch_id_fk" FOREIGN KEY ("organization_id","trainer_id","branch_id") REFERENCES "gym"."trainer_branches"("organization_id","trainer_id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."schedule_slots" ADD CONSTRAINT "schedule_slots_organization_id_room_id_branch_id_schedule_rooms_organization_id_id_branch_id_fk" FOREIGN KEY ("organization_id","room_id","branch_id") REFERENCES "gym"."schedule_rooms"("organization_id","id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainer_assignments" ADD CONSTRAINT "trainer_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainer_assignments" ADD CONSTRAINT "trainer_assignments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainer_assignments" ADD CONSTRAINT "trainer_assignments_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainer_assignments" ADD CONSTRAINT "trainer_assignments_organization_id_trainer_id_branch_id_trainer_branches_organization_id_trainer_id_branch_id_fk" FOREIGN KEY ("organization_id","trainer_id","branch_id") REFERENCES "gym"."trainer_branches"("organization_id","trainer_id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainer_assignments" ADD CONSTRAINT "trainer_assignments_organization_id_member_id_members_organization_id_id_fk" FOREIGN KEY ("organization_id","member_id") REFERENCES "gym"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainer_availability" ADD CONSTRAINT "trainer_availability_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainer_availability" ADD CONSTRAINT "trainer_availability_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainer_availability" ADD CONSTRAINT "trainer_availability_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainer_availability" ADD CONSTRAINT "trainer_availability_organization_id_trainer_id_branch_id_trainer_branches_organization_id_trainer_id_branch_id_fk" FOREIGN KEY ("organization_id","trainer_id","branch_id") REFERENCES "gym"."trainer_branches"("organization_id","trainer_id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainer_branches" ADD CONSTRAINT "trainer_branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainer_branches" ADD CONSTRAINT "trainer_branches_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainer_branches" ADD CONSTRAINT "trainer_branches_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainer_branches" ADD CONSTRAINT "trainer_branches_organization_id_trainer_id_trainers_organization_id_id_fk" FOREIGN KEY ("organization_id","trainer_id") REFERENCES "gym"."trainers"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainer_branches" ADD CONSTRAINT "trainer_branches_organization_id_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "gym"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainers" ADD CONSTRAINT "trainers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainers" ADD CONSTRAINT "trainers_login_user_id_user_id_fk" FOREIGN KEY ("login_user_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainers" ADD CONSTRAINT "trainers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."trainers" ADD CONSTRAINT "trainers_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_session_member_idx" ON "gym"."personal_sessions" USING btree ("organization_id","member_id","slot_id");--> statement-breakpoint
CREATE INDEX "schedule_branch_time_idx" ON "gym"."schedule_slots" USING btree ("organization_id","branch_id","starts_at","id");--> statement-breakpoint
CREATE INDEX "schedule_trainer_time_idx" ON "gym"."schedule_slots" USING btree ("organization_id","trainer_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "schedule_room_time_idx" ON "gym"."schedule_slots" USING btree ("organization_id","room_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "trainer_assignment_member_idx" ON "gym"."trainer_assignments" USING btree ("organization_id","member_id","start_on");--> statement-breakpoint
CREATE INDEX "trainer_assignment_branch_idx" ON "gym"."trainer_assignments" USING btree ("organization_id","branch_id","trainer_id","start_on");--> statement-breakpoint
CREATE INDEX "trainer_availability_lookup_idx" ON "gym"."trainer_availability" USING btree ("organization_id","trainer_id","branch_id","weekday");--> statement-breakpoint
CREATE INDEX "trainer_branch_directory_idx" ON "gym"."trainer_branches" USING btree ("organization_id","branch_id","trainer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trainer_login_once" ON "gym"."trainers" USING btree ("organization_id","login_user_id") WHERE "gym"."trainers"."login_user_id" is not null;--> statement-breakpoint
CREATE INDEX "trainer_directory_idx" ON "gym"."trainers" USING btree ("organization_id","name","id");