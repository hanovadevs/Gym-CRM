CREATE TABLE "gym"."financial_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"originating_branch_id" uuid NOT NULL,
	"payment_id" uuid,
	"kind" text NOT NULL,
	"number" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"cash_on" date NOT NULL,
	"reason" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"balance_after_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_corrections_organization_id_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "financial_corrections_organization_id_actor_id_request_key_unique" UNIQUE("organization_id","actor_id","request_key"),
	CONSTRAINT "correction_values" CHECK ("gym"."financial_corrections"."kind" in ('credit','refund','refund_credit','void') and "gym"."financial_corrections"."amount_minor" between 0 and 999999999999 and ("gym"."financial_corrections"."kind"='void')=("gym"."financial_corrections"."amount_minor"=0) and ("gym"."financial_corrections"."kind" in ('refund','refund_credit'))=("gym"."financial_corrections"."payment_id" is not null) and "gym"."financial_corrections"."balance_after_minor" between 0 and 999999999999 and length(btrim("gym"."financial_corrections"."reason")) between 3 and 300 and length("gym"."financial_corrections"."reference")<=100 and "gym"."financial_corrections"."request_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "gym"."financial_corrections" ADD CONSTRAINT "financial_corrections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."financial_corrections" ADD CONSTRAINT "financial_corrections_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."financial_corrections" ADD CONSTRAINT "financial_corrections_organization_id_invoice_id_member_id_originating_branch_id_currency_invoices_organization_id_id_member_id_originating_branch_id_currency_fk" FOREIGN KEY ("organization_id","invoice_id","member_id","originating_branch_id","currency") REFERENCES "gym"."invoices"("organization_id","id","member_id","originating_branch_id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."financial_corrections" ADD CONSTRAINT "financial_corrections_organization_id_payment_id_payments_organization_id_id_fk" FOREIGN KEY ("organization_id","payment_id") REFERENCES "gym"."payments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "corrections_invoice_idx" ON "gym"."financial_corrections" USING btree ("organization_id","invoice_id");--> statement-breakpoint
CREATE INDEX "corrections_payment_idx" ON "gym"."financial_corrections" USING btree ("organization_id","payment_id");--> statement-breakpoint
CREATE INDEX "corrections_cash_idx" ON "gym"."financial_corrections" USING btree ("organization_id","originating_branch_id","cash_on");