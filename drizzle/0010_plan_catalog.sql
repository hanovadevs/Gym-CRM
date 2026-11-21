CREATE TABLE "gym"."plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"duration_unit" text NOT NULL,
	"duration_count" integer NOT NULL,
	"access_mode" text NOT NULL,
	"gym_floor" boolean NOT NULL,
	"classes" boolean NOT NULL,
	"personal_training" boolean NOT NULL,
	"reason" text NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_versions_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "plan_versions_organization_id_plan_id_version_unique" UNIQUE("organization_id","plan_id","version"),
	CONSTRAINT "plan_versions_organization_id_created_by_request_key_unique" UNIQUE("organization_id","created_by","request_key"),
	CONSTRAINT "plan_version_values" CHECK ("gym"."plan_versions"."version">0 and length(btrim("gym"."plan_versions"."name")) between 1 and 100 and "gym"."plan_versions"."amount_minor" between 0 and 999999999999 and "gym"."plan_versions"."currency" ~ '^[A-Z]{3}$' and (("gym"."plan_versions"."duration_unit"='months' and "gym"."plan_versions"."duration_count" between 1 and 120) or ("gym"."plan_versions"."duration_unit"='days' and "gym"."plan_versions"."duration_count" between 1 and 3650)) and "gym"."plan_versions"."access_mode" in ('home_branch','all_branches') and ("gym"."plan_versions"."gym_floor" or "gym"."plan_versions"."classes" or "gym"."plan_versions"."personal_training") and length(btrim("gym"."plan_versions"."reason")) between 3 and 300)
);
--> statement-breakpoint
CREATE TABLE "gym"."plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"code" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "plans_organization_id_code_unique" UNIQUE("organization_id","code"),
	CONSTRAINT "plan_identity" CHECK ("gym"."plans"."code" ~ '^[A-Z0-9][A-Z0-9-]{0,23}$' and "gym"."plans"."revision">0)
);
--> statement-breakpoint
ALTER TABLE "gym"."plan_versions" ADD CONSTRAINT "plan_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."plan_versions" ADD CONSTRAINT "plan_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."plan_versions" ADD CONSTRAINT "plan_versions_organization_id_plan_id_plans_organization_id_id_fk" FOREIGN KEY ("organization_id","plan_id") REFERENCES "gym"."plans"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."plans" ADD CONSTRAINT "plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."plans" ADD CONSTRAINT "plans_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."plans" ADD CONSTRAINT "plans_organization_id_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "gym"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_versions_creator_idx" ON "gym"."plan_versions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "plans_branch_idx" ON "gym"."plans" USING btree ("organization_id","branch_id","archived_at");--> statement-breakpoint
CREATE INDEX "plans_creator_idx" ON "gym"."plans" USING btree ("created_by");