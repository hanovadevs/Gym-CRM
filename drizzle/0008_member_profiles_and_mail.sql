CREATE TABLE "app_auth"."mail_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" text NOT NULL,
	"organization_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"message_id" text,
	"error_code" text,
	"attempted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_kind_status" CHECK ("app_auth"."mail_outbox"."kind" in ('recovery','invitation') and "app_auth"."mail_outbox"."status" in ('pending','sending','sent','failed','uncertain','expired'))
);
--> statement-breakpoint
CREATE TABLE "gym"."member_contacts" (
	"organization_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"relationship" text DEFAULT '' NOT NULL,
	CONSTRAINT "member_contacts_organization_id_member_id_unique" UNIQUE("organization_id","member_id"),
	CONSTRAINT "emergency_contact_present" CHECK (length(btrim("gym"."member_contacts"."name")) between 1 and 100 and length(regexp_replace("gym"."member_contacts"."phone",'[^0-9]','','g')) between 7 and 15)
);
--> statement-breakpoint
CREATE TABLE "gym"."member_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"visibility" text NOT NULL,
	"body" text NOT NULL,
	"request_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_notes_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "member_notes_organization_id_author_user_id_request_key_unique" UNIQUE("organization_id","author_user_id","request_key"),
	CONSTRAINT "member_note_bounds" CHECK (length(btrim("gym"."member_notes"."body")) between 1 and 2000 and "gym"."member_notes"."visibility" in ('operational','management'))
);
--> statement-breakpoint
CREATE TABLE "gym"."member_note_withdrawals" (
	"organization_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_note_withdrawals_organization_id_note_id_unique" UNIQUE("organization_id","note_id")
);
--> statement-breakpoint
ALTER TABLE "app_auth"."mail_outbox" ADD CONSTRAINT "mail_outbox_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_auth"."mail_outbox" ADD CONSTRAINT "mail_outbox_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_contacts" ADD CONSTRAINT "member_contacts_organization_id_member_id_members_organization_id_id_fk" FOREIGN KEY ("organization_id","member_id") REFERENCES "gym"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_notes" ADD CONSTRAINT "member_notes_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_notes" ADD CONSTRAINT "member_notes_organization_id_member_id_members_organization_id_id_fk" FOREIGN KEY ("organization_id","member_id") REFERENCES "gym"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_note_withdrawals" ADD CONSTRAINT "member_note_withdrawals_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."member_note_withdrawals" ADD CONSTRAINT "member_note_withdrawals_organization_id_note_id_member_notes_organization_id_id_fk" FOREIGN KEY ("organization_id","note_id") REFERENCES "gym"."member_notes"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_outbox_pending_idx" ON "app_auth"."mail_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "mail_outbox_user_idx" ON "app_auth"."mail_outbox" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "mail_outbox_org_idx" ON "app_auth"."mail_outbox" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_notes_member_time_idx" ON "gym"."member_notes" USING btree ("organization_id","member_id","created_at","id");--> statement-breakpoint
CREATE INDEX "member_notes_author_idx" ON "gym"."member_notes" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "note_withdrawals_actor_idx" ON "gym"."member_note_withdrawals" USING btree ("actor_user_id");