CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE TABLE "platform"."administrators" (
	"user_id" text PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"reason" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_actor_user_id_request_key_unique" UNIQUE("actor_user_id","request_key"),
	CONSTRAINT "platform_event_action" CHECK ("platform"."events"."action" in ('gym.created','gym.updated'))
);
--> statement-breakpoint
ALTER TABLE "gym"."organizations" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "platform"."administrators" ADD CONSTRAINT "administrators_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."events" ADD CONSTRAINT "events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_events_time_idx" ON "platform"."events" USING btree ("occurred_at");