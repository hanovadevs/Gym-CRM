CREATE TABLE "platform"."billing_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"operation" text NOT NULL,
	"reason" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_requests_organization_id_actor_id_request_key_unique" UNIQUE("organization_id","actor_id","request_key"),
	CONSTRAINT "platform_billing_request_values" CHECK ("platform"."billing_requests"."operation" in ('charge','payment','reverse','void') and "platform"."billing_requests"."request_hash" ~ '^[0-9a-f]{64}$' and length(btrim("platform"."billing_requests"."reason")) between 3 and 300 and jsonb_typeof("platform"."billing_requests"."result")='object')
);
--> statement-breakpoint
CREATE TABLE "platform"."billing_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"billing_month" date NOT NULL,
	"due_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"void_reason" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_charges_organization_id_id_currency_unique" UNIQUE("organization_id","id","currency"),
	CONSTRAINT "platform_charge_values" CHECK (extract(day from "platform"."billing_charges"."billing_month")=1 and "platform"."billing_charges"."due_on">="platform"."billing_charges"."billing_month" and "platform"."billing_charges"."amount_minor">0 and "platform"."billing_charges"."amount_minor"<=999999999999 and "platform"."billing_charges"."currency" ~ '^[A-Z]{3}$' and (("platform"."billing_charges"."voided_at" is null and "platform"."billing_charges"."voided_by" is null and "platform"."billing_charges"."void_reason"='') or ("platform"."billing_charges"."voided_at" is not null and "platform"."billing_charges"."voided_by" is not null and length(btrim("platform"."billing_charges"."void_reason")) between 3 and 300)))
);
--> statement-breakpoint
CREATE TABLE "platform"."billing_reversals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"cash_on" date NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_reversals_organization_id_payment_id_unique" UNIQUE("organization_id","payment_id"),
	CONSTRAINT "platform_reversal_reason" CHECK (length(btrim("platform"."billing_reversals"."reason")) between 3 and 300)
);
--> statement-breakpoint
CREATE TABLE "platform"."billing_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"paid_on" date NOT NULL,
	"method" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_payments_organization_id_id_charge_id_amount_minor_currency_unique" UNIQUE("organization_id","id","charge_id","amount_minor","currency"),
	CONSTRAINT "platform_payment_values" CHECK ("platform"."billing_payments"."amount_minor">0 and "platform"."billing_payments"."amount_minor"<=999999999999 and "platform"."billing_payments"."method" in ('cash','bank_transfer','other') and length("platform"."billing_payments"."reference")<=100 and length("platform"."billing_payments"."note")<=300 and ("platform"."billing_payments"."method"<>'bank_transfer' or length(btrim("platform"."billing_payments"."reference"))>=3))
);
--> statement-breakpoint
ALTER TABLE "platform"."billing_requests" ADD CONSTRAINT "billing_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."billing_requests" ADD CONSTRAINT "billing_requests_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."billing_charges" ADD CONSTRAINT "billing_charges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."billing_charges" ADD CONSTRAINT "billing_charges_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."billing_charges" ADD CONSTRAINT "billing_charges_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."billing_reversals" ADD CONSTRAINT "billing_reversals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."billing_reversals" ADD CONSTRAINT "billing_reversals_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."billing_reversals" ADD CONSTRAINT "billing_reversals_organization_id_payment_id_charge_id_amount_minor_currency_billing_payments_organization_id_id_charge_id_amount_minor_currency_fk" FOREIGN KEY ("organization_id","payment_id","charge_id","amount_minor","currency") REFERENCES "platform"."billing_payments"("organization_id","id","charge_id","amount_minor","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."billing_payments" ADD CONSTRAINT "billing_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."billing_payments" ADD CONSTRAINT "billing_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."billing_payments" ADD CONSTRAINT "billing_payments_organization_id_charge_id_currency_billing_charges_organization_id_id_currency_fk" FOREIGN KEY ("organization_id","charge_id","currency") REFERENCES "platform"."billing_charges"("organization_id","id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_billing_requests_time_idx" ON "platform"."billing_requests" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_monthly_charge_once" ON "platform"."billing_charges" USING btree ("organization_id","billing_month") WHERE "platform"."billing_charges"."voided_at" is null;--> statement-breakpoint
CREATE INDEX "platform_charges_period_idx" ON "platform"."billing_charges" USING btree ("organization_id","billing_month");--> statement-breakpoint
CREATE INDEX "platform_reversal_charge_idx" ON "platform"."billing_reversals" USING btree ("organization_id","charge_id");--> statement-breakpoint
CREATE INDEX "platform_payment_charge_idx" ON "platform"."billing_payments" USING btree ("organization_id","charge_id");