CREATE TABLE "gym"."fee_reminder_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"local_day" date NOT NULL,
	"auth_user_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"payload" jsonb,
	"error_code" text,
	"started_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_reminder_one_daily_digest" UNIQUE("organization_id","local_day"),
	CONSTRAINT "fee_reminder_delivery_values" CHECK ("gym"."fee_reminder_deliveries"."status" in ('queued','sending','sent','failed','uncertain','skipped') and "gym"."fee_reminder_deliveries"."attempts" between 0 and 3 and length("gym"."fee_reminder_deliveries"."recipient_email") between 3 and 254 and ("gym"."fee_reminder_deliveries"."payload" is null or jsonb_typeof("gym"."fee_reminder_deliveries"."payload")='object') and ("gym"."fee_reminder_deliveries"."status"<>'sent' or "gym"."fee_reminder_deliveries"."sent_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "gym"."fee_reminder_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_reminder_settings_version" CHECK ("gym"."fee_reminder_settings"."version">0)
);
--> statement-breakpoint
ALTER TABLE "gym"."fee_reminder_deliveries" ADD CONSTRAINT "fee_reminder_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."fee_reminder_deliveries" ADD CONSTRAINT "fee_reminder_deliveries_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."fee_reminder_settings" ADD CONSTRAINT "fee_reminder_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."fee_reminder_settings" ADD CONSTRAINT "fee_reminder_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fee_reminder_work_idx" ON "gym"."fee_reminder_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "fee_reminder_recipient_idx" ON "gym"."fee_reminder_deliveries" USING btree ("auth_user_id");