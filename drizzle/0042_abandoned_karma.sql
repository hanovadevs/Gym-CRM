CREATE TABLE "gym"."member_fee_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"start_on" date NOT NULL,
	"reminder_days" integer DEFAULT 7 NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by" text,
	"end_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_fee_agreements_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "member_fee_agreement_identity" UNIQUE("organization_id","id","member_id","branch_id","currency","amount_minor"),
	CONSTRAINT "member_fee_values" CHECK ("gym"."member_fee_agreements"."amount_minor" between 0 and 999999999999 and "gym"."member_fee_agreements"."currency" ~ '^[A-Z]{3}$' and "gym"."member_fee_agreements"."reminder_days" between 1 and 30 and ("gym"."member_fee_agreements"."ended_at" is null)=("gym"."member_fee_agreements"."ended_by" is null) and ("gym"."member_fee_agreements"."ended_at" is null)=("gym"."member_fee_agreements"."end_reason" is null) and ("gym"."member_fee_agreements"."end_reason" is null or length(btrim("gym"."member_fee_agreements"."end_reason")) between 3 and 300))
);
--> statement-breakpoint
CREATE TABLE "gym"."member_fee_periods" (
	"organization_id" uuid NOT NULL,
	"membership_id" uuid PRIMARY KEY NOT NULL,
	"agreement_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gym"."member_fee_agreements" ADD CONSTRAINT "member_fee_agreements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_fee_agreements" ADD CONSTRAINT "member_fee_agreements_ended_by_user_id_fk" FOREIGN KEY ("ended_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_fee_agreements" ADD CONSTRAINT "member_fee_agreements_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_fee_agreements" ADD CONSTRAINT "member_fee_agreements_organization_id_member_id_members_organization_id_id_fk" FOREIGN KEY ("organization_id","member_id") REFERENCES "gym"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_fee_agreements" ADD CONSTRAINT "member_fee_agreements_organization_id_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "gym"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_fee_agreements" ADD CONSTRAINT "member_fee_agreements_organization_id_plan_id_plans_organization_id_id_fk" FOREIGN KEY ("organization_id","plan_id") REFERENCES "gym"."plans"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_fee_periods" ADD CONSTRAINT "member_fee_periods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_fee_periods" ADD CONSTRAINT "member_fee_periods_organization_id_agreement_id_member_id_branch_id_currency_amount_minor_member_fee_agreements_organization_id_id_member_id_branch_id_currency_amount_minor_fk" FOREIGN KEY ("organization_id","agreement_id","member_id","branch_id","currency","amount_minor") REFERENCES "gym"."member_fee_agreements"("organization_id","id","member_id","branch_id","currency","amount_minor") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_fee_periods" ADD CONSTRAINT "member_fee_periods_organization_id_membership_id_member_id_branch_id_currency_amount_minor_memberships_organization_id_id_member_id_home_branch_id_currency_amount_minor_fk" FOREIGN KEY ("organization_id","membership_id","member_id","branch_id","currency","amount_minor") REFERENCES "gym"."memberships"("organization_id","id","member_id","home_branch_id","currency","amount_minor") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_fee_one_current" ON "gym"."member_fee_agreements" USING btree ("organization_id","member_id") WHERE "gym"."member_fee_agreements"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "member_fee_branch_idx" ON "gym"."member_fee_agreements" USING btree ("organization_id","branch_id");--> statement-breakpoint
CREATE INDEX "member_fee_plan_idx" ON "gym"."member_fee_agreements" USING btree ("organization_id","plan_id");--> statement-breakpoint
CREATE INDEX "member_fee_period_agreement_idx" ON "gym"."member_fee_periods" USING btree ("organization_id","agreement_id");--> statement-breakpoint
CREATE INDEX "member_fee_period_member_idx" ON "gym"."member_fee_periods" USING btree ("organization_id","member_id");