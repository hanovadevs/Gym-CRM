CREATE TABLE "gym"."attendance_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"operation" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_requests_organization_id_actor_id_request_key_unique" UNIQUE("organization_id","actor_id","request_key"),
	CONSTRAINT "attendance_request_values" CHECK ("gym"."attendance_requests"."operation" in ('check_in','check_out') and "gym"."attendance_requests"."request_hash" ~ '^[0-9a-f]{64}$' and jsonb_typeof("gym"."attendance_requests"."result")='object')
);
--> statement-breakpoint
CREATE TABLE "gym"."attendance_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"membership_id" uuid,
	"checked_in_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"checked_out_at" timestamp with time zone,
	"checked_in_by" text NOT NULL,
	"checked_out_by" text,
	"eligibility_snapshot" jsonb NOT NULL,
	"override_actor_id" text,
	"override_reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "attendance_visits_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "attendance_exit_consistent" CHECK (("gym"."attendance_visits"."checked_out_at" is null)=("gym"."attendance_visits"."checked_out_by" is null) and ("gym"."attendance_visits"."checked_out_at" is null or "gym"."attendance_visits"."checked_out_at">="gym"."attendance_visits"."checked_in_at")),
	CONSTRAINT "attendance_override_reason" CHECK (("gym"."attendance_visits"."override_actor_id" is null and "gym"."attendance_visits"."override_reason"='') or ("gym"."attendance_visits"."override_actor_id" is not null and length(btrim("gym"."attendance_visits"."override_reason")) between 3 and 300)),
	CONSTRAINT "attendance_eligibility_snapshot" CHECK (jsonb_typeof("gym"."attendance_visits"."eligibility_snapshot")='object' and "gym"."attendance_visits"."eligibility_snapshot" ?& ARRAY['allowed','reason'] and jsonb_typeof("gym"."attendance_visits"."eligibility_snapshot"->'allowed')='boolean' and jsonb_typeof("gym"."attendance_visits"."eligibility_snapshot"->'reason')='string' and (("gym"."attendance_visits"."eligibility_snapshot"->>'allowed')::boolean or "gym"."attendance_visits"."override_actor_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "gym"."member_access_tokens" (
	"organization_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_access_tokens_token_unique" UNIQUE("token"),
	CONSTRAINT "member_access_tokens_organization_id_member_id_unique" UNIQUE("organization_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "gym"."attendance_requests" ADD CONSTRAINT "attendance_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."attendance_requests" ADD CONSTRAINT "attendance_requests_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."attendance_requests" ADD CONSTRAINT "attendance_requests_organization_id_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "gym"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."attendance_requests" ADD CONSTRAINT "attendance_requests_organization_id_member_id_members_organization_id_id_fk" FOREIGN KEY ("organization_id","member_id") REFERENCES "gym"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."attendance_requests" ADD CONSTRAINT "attendance_requests_organization_id_visit_id_attendance_visits_organization_id_id_fk" FOREIGN KEY ("organization_id","visit_id") REFERENCES "gym"."attendance_visits"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."attendance_visits" ADD CONSTRAINT "attendance_visits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."attendance_visits" ADD CONSTRAINT "attendance_visits_checked_in_by_user_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."attendance_visits" ADD CONSTRAINT "attendance_visits_checked_out_by_user_id_fk" FOREIGN KEY ("checked_out_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."attendance_visits" ADD CONSTRAINT "attendance_visits_override_actor_id_user_id_fk" FOREIGN KEY ("override_actor_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."attendance_visits" ADD CONSTRAINT "attendance_visits_organization_id_member_id_members_organization_id_id_fk" FOREIGN KEY ("organization_id","member_id") REFERENCES "gym"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."attendance_visits" ADD CONSTRAINT "attendance_visits_organization_id_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "gym"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."attendance_visits" ADD CONSTRAINT "attendance_visits_organization_id_membership_id_memberships_organization_id_id_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "gym"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_access_tokens" ADD CONSTRAINT "member_access_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_access_tokens" ADD CONSTRAINT "member_access_tokens_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_access_tokens" ADD CONSTRAINT "member_access_tokens_organization_id_member_id_members_organization_id_id_fk" FOREIGN KEY ("organization_id","member_id") REFERENCES "gym"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_request_visit_idx" ON "gym"."attendance_requests" USING btree ("organization_id","visit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_visit_per_member" ON "gym"."attendance_visits" USING btree ("organization_id","member_id") WHERE "gym"."attendance_visits"."checked_out_at" is null;--> statement-breakpoint
CREATE INDEX "attendance_branch_time_idx" ON "gym"."attendance_visits" USING btree ("organization_id","branch_id","checked_in_at","id");--> statement-breakpoint
CREATE INDEX "attendance_member_time_idx" ON "gym"."attendance_visits" USING btree ("organization_id","member_id","checked_in_at","id");
