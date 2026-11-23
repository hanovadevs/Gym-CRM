CREATE TABLE "gym"."employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"trainer_id" uuid,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"start_on" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"salary_minor" bigint,
	"currency" text NOT NULL,
	"pay_day" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "employee_values" CHECK (length(btrim("gym"."employees"."name")) between 2 and 100 and length(btrim("gym"."employees"."title")) between 2 and 100 and length("gym"."employees"."phone")<=50 and length("gym"."employees"."email")<=254 and ("gym"."employees"."salary_minor" is null or "gym"."employees"."salary_minor" between 1 and 999999999999) and "gym"."employees"."currency" ~ '^[A-Z]{3}$' and "gym"."employees"."pay_day" between 1 and 28 and "gym"."employees"."version">0)
);
--> statement-breakpoint
CREATE TABLE "gym"."payroll_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"employee_name" text NOT NULL,
	"employee_title" text NOT NULL,
	"period" date NOT NULL,
	"due_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"void_reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "payroll_charges_organization_id_id_branch_id_currency_unique" UNIQUE("organization_id","id","branch_id","currency"),
	CONSTRAINT "payroll_charge_values" CHECK (extract(day from "gym"."payroll_charges"."period")=1 and "gym"."payroll_charges"."due_on">="gym"."payroll_charges"."period" and "gym"."payroll_charges"."amount_minor" between 1 and 999999999999 and "gym"."payroll_charges"."currency" ~ '^[A-Z]{3}$' and (("gym"."payroll_charges"."voided_at" is null and "gym"."payroll_charges"."voided_by" is null and "gym"."payroll_charges"."void_reason"='') or ("gym"."payroll_charges"."voided_at" is not null and "gym"."payroll_charges"."voided_by" is not null and length(btrim("gym"."payroll_charges"."void_reason")) between 3 and 300)))
);
--> statement-breakpoint
CREATE TABLE "gym"."payroll_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_payments_organization_id_expense_id_unique" UNIQUE("organization_id","expense_id")
);
--> statement-breakpoint
CREATE TABLE "gym"."payroll_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"operation" text NOT NULL,
	"branch_ids" uuid[] NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_requests_organization_id_actor_id_request_key_unique" UNIQUE("organization_id","actor_id","request_key"),
	CONSTRAINT "payroll_request_hash" CHECK ("gym"."payroll_requests"."request_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "gym"."employees" ADD CONSTRAINT "employees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."employees" ADD CONSTRAINT "employees_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."employees" ADD CONSTRAINT "employees_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."employees" ADD CONSTRAINT "employees_organization_id_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "gym"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."employees" ADD CONSTRAINT "employees_organization_id_trainer_id_trainers_organization_id_id_fk" FOREIGN KEY ("organization_id","trainer_id") REFERENCES "gym"."trainers"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."payroll_charges" ADD CONSTRAINT "payroll_charges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."payroll_charges" ADD CONSTRAINT "payroll_charges_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."payroll_charges" ADD CONSTRAINT "payroll_charges_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."payroll_charges" ADD CONSTRAINT "payroll_charges_organization_id_employee_id_employees_organization_id_id_fk" FOREIGN KEY ("organization_id","employee_id") REFERENCES "gym"."employees"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."payroll_charges" ADD CONSTRAINT "payroll_charges_organization_id_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "gym"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."payroll_payments" ADD CONSTRAINT "payroll_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."payroll_payments" ADD CONSTRAINT "payroll_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."payroll_payments" ADD CONSTRAINT "payroll_payments_organization_id_charge_id_branch_id_currency_payroll_charges_organization_id_id_branch_id_currency_fk" FOREIGN KEY ("organization_id","charge_id","branch_id","currency") REFERENCES "gym"."payroll_charges"("organization_id","id","branch_id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."payroll_payments" ADD CONSTRAINT "payroll_payments_expense_branch_fk" FOREIGN KEY ("organization_id","expense_id","branch_id") REFERENCES "gym"."expenses"("organization_id","id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."payroll_requests" ADD CONSTRAINT "payroll_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."payroll_requests" ADD CONSTRAINT "payroll_requests_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_trainer_once" ON "gym"."employees" USING btree ("organization_id","trainer_id") WHERE "gym"."employees"."trainer_id" is not null;--> statement-breakpoint
CREATE INDEX "employee_directory_idx" ON "gym"."employees" USING btree ("organization_id","branch_id","name","id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_employee_period_once" ON "gym"."payroll_charges" USING btree ("organization_id","employee_id","period") WHERE "gym"."payroll_charges"."voided_at" is null;--> statement-breakpoint
CREATE INDEX "payroll_branch_period_idx" ON "gym"."payroll_charges" USING btree ("organization_id","branch_id","period","id");--> statement-breakpoint
CREATE INDEX "payroll_charge_payment_idx" ON "gym"."payroll_payments" USING btree ("organization_id","charge_id");