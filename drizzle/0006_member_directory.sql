CREATE TABLE "gym"."members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"home_branch_id" uuid NOT NULL,
	"member_code" text NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"normalized_phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"joined_on" date NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"registration_key" uuid NOT NULL,
	"registration_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "members_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "members_organization_id_member_code_unique" UNIQUE("organization_id","member_code"),
	CONSTRAINT "members_organization_id_created_by_registration_key_unique" UNIQUE("organization_id","created_by","registration_key"),
	CONSTRAINT "member_valid_version_name" CHECK ("gym"."members"."version">0 and length(btrim("gym"."members"."name")) between 1 and 100),
	CONSTRAINT "member_contact_required" CHECK ("gym"."members"."normalized_phone"<>'' or "gym"."members"."email"<>''),
	CONSTRAINT "member_phone_normalized" CHECK ("gym"."members"."normalized_phone"=regexp_replace("gym"."members"."phone",'[^0-9]','','g') and ("gym"."members"."normalized_phone"='' or "gym"."members"."normalized_phone" ~ '^[0-9]{7,15}$'))
);
--> statement-breakpoint
CREATE TABLE "gym"."number_counters" (
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" bigint NOT NULL,
	CONSTRAINT "number_counters_organization_id_kind_unique" UNIQUE("organization_id","kind"),
	CONSTRAINT "counter_positive" CHECK ("gym"."number_counters"."value">0)
);
--> statement-breakpoint
ALTER TABLE "gym"."members" ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."members" ADD CONSTRAINT "members_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."members" ADD CONSTRAINT "members_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."members" ADD CONSTRAINT "members_organization_id_home_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","home_branch_id") REFERENCES "gym"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."number_counters" ADD CONSTRAINT "number_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "members_org_branch_name_idx" ON "gym"."members" USING btree ("organization_id","home_branch_id","name","id");--> statement-breakpoint
CREATE INDEX "members_org_phone_idx" ON "gym"."members" USING btree ("organization_id","normalized_phone");--> statement-breakpoint
CREATE INDEX "members_org_email_idx" ON "gym"."members" USING btree ("organization_id","email");