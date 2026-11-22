CREATE TABLE "gym"."gym_accounts" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"auth_user_id" text NOT NULL,
	"owner_email" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gym_accounts_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "gym_account_values" CHECK ("gym"."gym_accounts"."version">0 and ("gym"."gym_accounts"."owner_email" is null or (length("gym"."gym_accounts"."owner_email") between 3 and 254 and "gym"."gym_accounts"."owner_email"=lower(btrim("gym"."gym_accounts"."owner_email")) and "gym"."gym_accounts"."owner_email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')))
);
--> statement-breakpoint
ALTER TABLE "gym"."gym_accounts" ADD CONSTRAINT "gym_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."gym_accounts" ADD CONSTRAINT "gym_accounts_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."gym_accounts" ADD CONSTRAINT "gym_accounts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."gym_accounts" ADD CONSTRAINT "gym_accounts_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gym_owner_recovery_idx" ON "gym"."gym_accounts" USING btree ("owner_email","organization_id");