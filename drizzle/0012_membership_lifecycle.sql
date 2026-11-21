CREATE TABLE "gym"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"originating_branch_id" uuid NOT NULL,
	"number" text NOT NULL,
	"description" text NOT NULL,
	"total_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"issued_on" date NOT NULL,
	"due_on" date NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "invoices_organization_id_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "invoices_organization_id_membership_id_unique" UNIQUE("organization_id","membership_id"),
	CONSTRAINT "invoice_values" CHECK ("gym"."invoices"."total_minor" between 0 and 999999999999 and "gym"."invoices"."due_on">="gym"."invoices"."issued_on" and length(btrim("gym"."invoices"."description")) between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "gym"."membership_freezes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"start_on" date NOT NULL,
	"end_on_exclusive" date NOT NULL,
	"extension_days" integer NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by" text,
	CONSTRAINT "membership_freezes_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "freeze_dates" CHECK ("gym"."membership_freezes"."end_on_exclusive">"gym"."membership_freezes"."start_on" and "gym"."membership_freezes"."extension_days"=("gym"."membership_freezes"."end_on_exclusive"-"gym"."membership_freezes"."start_on") and length(btrim("gym"."membership_freezes"."reason")) between 3 and 300 and (("gym"."membership_freezes"."reversed_at" is null)=("gym"."membership_freezes"."reversed_by" is null)))
);
--> statement-breakpoint
CREATE TABLE "gym"."membership_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"operation" text NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_requests_organization_id_actor_id_operation_request_key_unique" UNIQUE("organization_id","actor_id","operation","request_key"),
	CONSTRAINT "membership_operation" CHECK ("gym"."membership_requests"."operation" in ('enroll','renew','activate','freeze','reverse_freeze','cancel'))
);
--> statement-breakpoint
CREATE TABLE "gym"."memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"home_branch_id" uuid NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"start_on" date NOT NULL,
	"original_end_on_exclusive" date NOT NULL,
	"end_on_exclusive" date NOT NULL,
	"lifecycle" text NOT NULL,
	"activated_at" timestamp with time zone,
	"cancelled_effective_on" date,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "membership_invoice_identity" UNIQUE("organization_id","id","member_id","home_branch_id","currency","amount_minor"),
	CONSTRAINT "membership_values" CHECK ("gym"."memberships"."end_on_exclusive">"gym"."memberships"."start_on" and "gym"."memberships"."original_end_on_exclusive">"gym"."memberships"."start_on" and "gym"."memberships"."end_on_exclusive">="gym"."memberships"."original_end_on_exclusive" and "gym"."memberships"."amount_minor" between 0 and 999999999999 and "gym"."memberships"."version">0 and "gym"."memberships"."lifecycle" in ('pending','active','cancelled') and ("gym"."memberships"."lifecycle"<>'active' or "gym"."memberships"."activated_at" is not null) and (("gym"."memberships"."lifecycle"='cancelled')=("gym"."memberships"."cancelled_effective_on" is not null)) and ("gym"."memberships"."cancelled_effective_on" is null or "gym"."memberships"."cancelled_effective_on"<="gym"."memberships"."end_on_exclusive") and jsonb_typeof("gym"."memberships"."snapshot")='object' and ("gym"."memberships"."snapshot"->>'planVersionId')="gym"."memberships"."plan_version_id"::text and ("gym"."memberships"."snapshot"->>'currency')="gym"."memberships"."currency" and ("gym"."memberships"."snapshot"->>'amountMinor')::bigint="gym"."memberships"."amount_minor")
);
--> statement-breakpoint
ALTER TABLE "gym"."invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."invoices" ADD CONSTRAINT "invoices_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."invoices" ADD CONSTRAINT "invoices_organization_id_membership_id_member_id_originating_branch_id_currency_total_minor_memberships_organization_id_id_member_id_home_branch_id_currency_amount_minor_fk" FOREIGN KEY ("organization_id","membership_id","member_id","originating_branch_id","currency","total_minor") REFERENCES "gym"."memberships"("organization_id","id","member_id","home_branch_id","currency","amount_minor") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."membership_freezes" ADD CONSTRAINT "membership_freezes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."membership_freezes" ADD CONSTRAINT "membership_freezes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."membership_freezes" ADD CONSTRAINT "membership_freezes_reversed_by_user_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."membership_freezes" ADD CONSTRAINT "membership_freezes_organization_id_membership_id_memberships_organization_id_id_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "gym"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."membership_requests" ADD CONSTRAINT "membership_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."membership_requests" ADD CONSTRAINT "membership_requests_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."membership_requests" ADD CONSTRAINT "membership_requests_organization_id_member_id_members_organization_id_id_fk" FOREIGN KEY ("organization_id","member_id") REFERENCES "gym"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."memberships" ADD CONSTRAINT "memberships_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."memberships" ADD CONSTRAINT "memberships_organization_id_member_id_members_organization_id_id_fk" FOREIGN KEY ("organization_id","member_id") REFERENCES "gym"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."memberships" ADD CONSTRAINT "memberships_organization_id_home_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","home_branch_id") REFERENCES "gym"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."memberships" ADD CONSTRAINT "memberships_organization_id_plan_version_id_plan_versions_organization_id_id_fk" FOREIGN KEY ("organization_id","plan_version_id") REFERENCES "gym"."plan_versions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_member_idx" ON "gym"."invoices" USING btree ("organization_id","member_id");--> statement-breakpoint
CREATE INDEX "invoices_branch_date_idx" ON "gym"."invoices" USING btree ("organization_id","originating_branch_id","issued_on");--> statement-breakpoint
CREATE INDEX "invoices_actor_idx" ON "gym"."invoices" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "freezes_membership_idx" ON "gym"."membership_freezes" USING btree ("organization_id","membership_id");--> statement-breakpoint
CREATE INDEX "freezes_actor_idx" ON "gym"."membership_freezes" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "freezes_reversed_actor_idx" ON "gym"."membership_freezes" USING btree ("reversed_by");--> statement-breakpoint
CREATE INDEX "membership_requests_member_idx" ON "gym"."membership_requests" USING btree ("organization_id","member_id");--> statement-breakpoint
CREATE INDEX "membership_requests_actor_idx" ON "gym"."membership_requests" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "memberships_member_period_idx" ON "gym"."memberships" USING btree ("organization_id","member_id","start_on","end_on_exclusive");--> statement-breakpoint
CREATE INDEX "memberships_branch_idx" ON "gym"."memberships" USING btree ("organization_id","home_branch_id");--> statement-breakpoint
CREATE INDEX "memberships_plan_idx" ON "gym"."memberships" USING btree ("organization_id","plan_version_id");--> statement-breakpoint
CREATE INDEX "memberships_actor_idx" ON "gym"."memberships" USING btree ("created_by");