ALTER TABLE "gym"."invoices" ADD CONSTRAINT "invoice_payment_identity" UNIQUE("organization_id","id","member_id","originating_branch_id","currency");
--> statement-breakpoint
CREATE TABLE "gym"."payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"originating_branch_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "payment_allocations_organization_id_payment_id_unique" UNIQUE("organization_id","payment_id"),
	CONSTRAINT "allocation_positive" CHECK ("gym"."payment_allocations"."amount_minor" between 1 and 999999999999)
);
--> statement-breakpoint
CREATE TABLE "gym"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"originating_branch_id" uuid NOT NULL,
	"receipt_number" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"method" text NOT NULL,
	"paid_on" date NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"balance_after_minor" bigint NOT NULL,
	"activation_result" text NOT NULL,
	"receipt_snapshot" jsonb NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "payments_organization_id_receipt_number_unique" UNIQUE("organization_id","receipt_number"),
	CONSTRAINT "payments_organization_id_actor_id_request_key_unique" UNIQUE("organization_id","actor_id","request_key"),
	CONSTRAINT "payment_allocation_identity" UNIQUE("organization_id","id","invoice_id","member_id","originating_branch_id","currency","amount_minor"),
	CONSTRAINT "payment_values" CHECK ("gym"."payments"."amount_minor" between 1 and 999999999999 and "gym"."payments"."balance_after_minor" between 0 and 999999999999 and "gym"."payments"."currency" ~ '^[A-Z]{3}$' and "gym"."payments"."method" in ('cash','bank_transfer','other') and length("gym"."payments"."reference")<=100 and length("gym"."payments"."note")<=300 and ("gym"."payments"."method"<>'bank_transfer' or length(btrim("gym"."payments"."reference"))>=3) and "gym"."payments"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "payment_activation_result" CHECK ("gym"."payments"."activation_result" in ('activated','already_active','partial','not_linked','archived','cancelled','expired'))
);
--> statement-breakpoint
ALTER TABLE "gym"."payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_payment_id_invoice_id_member_id_originating_branch_id_currency_amount_minor_payments_organization_id_id_invoice_id_member_id_originating_branch_id_currency_amount_minor_fk" FOREIGN KEY ("organization_id","payment_id","invoice_id","member_id","originating_branch_id","currency","amount_minor") REFERENCES "gym"."payments"("organization_id","id","invoice_id","member_id","originating_branch_id","currency","amount_minor") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."payments" ADD CONSTRAINT "payments_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."payments" ADD CONSTRAINT "payments_organization_id_invoice_id_member_id_originating_branch_id_currency_invoices_organization_id_id_member_id_originating_branch_id_currency_fk" FOREIGN KEY ("organization_id","invoice_id","member_id","originating_branch_id","currency") REFERENCES "gym"."invoices"("organization_id","id","member_id","originating_branch_id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "allocations_invoice_idx" ON "gym"."payment_allocations" USING btree ("organization_id","invoice_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "gym"."payments" USING btree ("organization_id","invoice_id");--> statement-breakpoint
CREATE INDEX "payments_member_date_idx" ON "gym"."payments" USING btree ("organization_id","member_id","paid_on","id");--> statement-breakpoint
CREATE INDEX "payments_branch_date_idx" ON "gym"."payments" USING btree ("organization_id","originating_branch_id","paid_on","id");--> statement-breakpoint
CREATE INDEX "payments_actor_idx" ON "gym"."payments" USING btree ("actor_id");--> statement-breakpoint
