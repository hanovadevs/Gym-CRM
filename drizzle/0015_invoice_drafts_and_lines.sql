CREATE TABLE "gym"."billing_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_requests_organization_id_actor_id_request_key_unique" UNIQUE("organization_id","actor_id","request_key"),
	CONSTRAINT "billing_request_operation" CHECK ("gym"."billing_requests"."operation" in ('create','edit','issue'))
);
--> statement-breakpoint
CREATE TABLE "gym"."invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	CONSTRAINT "invoice_items_organization_id_invoice_id_revision_position_unique" UNIQUE("organization_id","invoice_id","revision","position"),
	CONSTRAINT "invoice_item_values" CHECK ("gym"."invoice_items"."revision">0 and "gym"."invoice_items"."position" between 1 and 30 and length(btrim("gym"."invoice_items"."description")) between 1 and 150 and "gym"."invoice_items"."quantity" between 1 and 10000 and "gym"."invoice_items"."unit_minor" between 0 and 999999999999 and "gym"."invoice_items"."discount_minor" between 0 and "gym"."invoice_items"."quantity"::bigint*"gym"."invoice_items"."unit_minor" and "gym"."invoice_items"."total_minor"="gym"."invoice_items"."quantity"::bigint*"gym"."invoice_items"."unit_minor"-"gym"."invoice_items"."discount_minor" and "gym"."invoice_items"."total_minor" between 0 and 999999999999)
);
--> statement-breakpoint
ALTER TABLE "gym"."invoices" ALTER COLUMN "membership_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."invoices" ALTER COLUMN "number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."invoices" ALTER COLUMN "issued_on" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."invoices" ADD COLUMN "status" text DEFAULT 'issued' NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."invoices" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."invoices" ADD COLUMN "line_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."invoices" ADD COLUMN "recipient_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."invoices" ADD COLUMN "recipient_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."invoices" ADD COLUMN "branch_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."invoices" ADD COLUMN "issuer_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "gym"."billing_requests" ADD CONSTRAINT "billing_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."billing_requests" ADD CONSTRAINT "billing_requests_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."billing_requests" ADD CONSTRAINT "billing_requests_organization_id_invoice_id_invoices_organization_id_id_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "gym"."invoices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."invoice_items" ADD CONSTRAINT "invoice_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."invoice_items" ADD CONSTRAINT "invoice_items_organization_id_invoice_id_invoices_organization_id_id_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "gym"."invoices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_requests_invoice_idx" ON "gym"."billing_requests" USING btree ("organization_id","invoice_id");--> statement-breakpoint
CREATE INDEX "billing_requests_actor_idx" ON "gym"."billing_requests" USING btree ("actor_id");--> statement-breakpoint
ALTER TABLE "gym"."invoices" ADD CONSTRAINT "invoices_organization_id_member_id_members_organization_id_id_fk" FOREIGN KEY ("organization_id","member_id") REFERENCES "gym"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."invoices" ADD CONSTRAINT "invoices_organization_id_originating_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","originating_branch_id") REFERENCES "gym"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_due_idx" ON "gym"."invoices" USING btree ("organization_id","status","due_on","id");--> statement-breakpoint
ALTER TABLE "gym"."invoices" ADD CONSTRAINT "invoice_lifecycle" CHECK ("gym"."invoices"."version">0 and "gym"."invoices"."line_revision">0 and (("gym"."invoices"."status"='draft' and "gym"."invoices"."membership_id" is null and "gym"."invoices"."number" is null and "gym"."invoices"."issued_on" is null) or ("gym"."invoices"."status"='issued' and "gym"."invoices"."number" is not null and "gym"."invoices"."issued_on" is not null)));