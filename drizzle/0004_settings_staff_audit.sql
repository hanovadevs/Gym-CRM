CREATE TABLE "gym"."audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gym"."branches" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."organizations" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."organizations" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."organizations" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."organizations" ADD COLUMN "receipt_prefix" text DEFAULT 'GYM' NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."organizations" ADD COLUMN "receipt_footer" text DEFAULT 'Thank you for training with us.' NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."organizations" ADD COLUMN "grace_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."organizations" ADD COLUMN "debt_blocks_access" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."organizations" ADD COLUMN "paid_activation" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."organizations" ADD COLUMN "settings_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."staff_memberships" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."audit_events" ADD CONSTRAINT "audit_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_org_time_idx" ON "gym"."audit_events" USING btree ("organization_id","occurred_at");