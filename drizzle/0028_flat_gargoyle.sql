CREATE TABLE "gym"."expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "expense_categories_organization_id_normalized_name_unique" UNIQUE("organization_id","normalized_name"),
	CONSTRAINT "expense_category_values" CHECK (length(btrim("gym"."expense_categories"."name")) between 1 and 80 and "gym"."expense_categories"."normalized_name"=lower(btrim("gym"."expense_categories"."name")) and "gym"."expense_categories"."version">0)
);
--> statement-breakpoint
CREATE TABLE "gym"."expense_reversals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"cash_on" date NOT NULL,
	"reason" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	CONSTRAINT "expense_reversals_organization_id_expense_id_unique" UNIQUE("organization_id","expense_id"),
	CONSTRAINT "expense_reversals_organization_id_actor_id_request_key_unique" UNIQUE("organization_id","actor_id","request_key"),
	CONSTRAINT "expense_reversal_values" CHECK ("gym"."expense_reversals"."amount_minor" between 1 and 999999999999 and length(btrim("gym"."expense_reversals"."reason")) between 3 and 300 and "gym"."expense_reversals"."request_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "gym"."expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"category_name" text NOT NULL,
	"number" text NOT NULL,
	"description" text NOT NULL,
	"payee" text DEFAULT '' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"paid_on" date NOT NULL,
	"method" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"file_id" uuid,
	"replaces_expense_id" uuid,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	CONSTRAINT "expenses_organization_id_id_branch_id_unique" UNIQUE("organization_id","id","branch_id"),
	CONSTRAINT "expense_reversal_identity" UNIQUE("organization_id","id","branch_id","currency","amount_minor"),
	CONSTRAINT "expenses_organization_id_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "expenses_organization_id_actor_id_request_key_unique" UNIQUE("organization_id","actor_id","request_key"),
	CONSTRAINT "expense_values" CHECK ("gym"."expenses"."amount_minor" between 1 and 999999999999 and "gym"."expenses"."currency" ~ '^[A-Z]{3}$' and "gym"."expenses"."method" in ('cash','bank_transfer','other') and length(btrim("gym"."expenses"."description")) between 3 and 300 and length(btrim("gym"."expenses"."category_name")) between 1 and 80 and length("gym"."expenses"."payee")<=120 and length("gym"."expenses"."reference")<=100 and "gym"."expenses"."request_hash" ~ '^[0-9a-f]{64}$' and "gym"."expenses"."replaces_expense_id" is distinct from "gym"."expenses"."id")
);
--> statement-breakpoint
CREATE TABLE "gym"."private_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"content" "bytea" NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"purpose" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	CONSTRAINT "private_files_organization_id_id_branch_id_unique" UNIQUE("organization_id","id","branch_id"),
	CONSTRAINT "private_files_organization_id_uploaded_by_request_key_unique" UNIQUE("organization_id","uploaded_by","request_key"),
	CONSTRAINT "private_file_values" CHECK ("gym"."private_files"."size_bytes" between 1 and 2097152 and octet_length("gym"."private_files"."content")="gym"."private_files"."size_bytes" and "gym"."private_files"."sha256" ~ '^[0-9a-f]{64}$' and "gym"."private_files"."request_hash" ~ '^[0-9a-f]{64}$' and "gym"."private_files"."content_type" in ('image/png','image/jpeg') and "gym"."private_files"."purpose"='expense_receipt' and length("gym"."private_files"."filename") between 1 and 160 and "gym"."private_files"."filename" !~ E'[\r\n]')
);
--> statement-breakpoint
ALTER TABLE "gym"."expense_categories" ADD CONSTRAINT "expense_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."expense_categories" ADD CONSTRAINT "expense_categories_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."expense_categories" ADD CONSTRAINT "expense_categories_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."expense_reversals" ADD CONSTRAINT "expense_reversals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."expense_reversals" ADD CONSTRAINT "expense_reversals_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."expense_reversals" ADD CONSTRAINT "expense_reversals_organization_id_expense_id_branch_id_currency_amount_minor_expenses_organization_id_id_branch_id_currency_amount_minor_fk" FOREIGN KEY ("organization_id","expense_id","branch_id","currency","amount_minor") REFERENCES "gym"."expenses"("organization_id","id","branch_id","currency","amount_minor") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."expenses" ADD CONSTRAINT "expenses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."expenses" ADD CONSTRAINT "expenses_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."expenses" ADD CONSTRAINT "expenses_organization_id_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "gym"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."expenses" ADD CONSTRAINT "expenses_organization_id_category_id_expense_categories_organization_id_id_fk" FOREIGN KEY ("organization_id","category_id") REFERENCES "gym"."expense_categories"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."expenses" ADD CONSTRAINT "expenses_organization_id_file_id_branch_id_private_files_organization_id_id_branch_id_fk" FOREIGN KEY ("organization_id","file_id","branch_id") REFERENCES "gym"."private_files"("organization_id","id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."expenses" ADD CONSTRAINT "expenses_organization_id_replaces_expense_id_branch_id_expenses_organization_id_id_branch_id_fk" FOREIGN KEY ("organization_id","replaces_expense_id","branch_id") REFERENCES "gym"."expenses"("organization_id","id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."private_files" ADD CONSTRAINT "private_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."private_files" ADD CONSTRAINT "private_files_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."private_files" ADD CONSTRAINT "private_files_organization_id_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "gym"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_reversal_cash_idx" ON "gym"."expense_reversals" USING btree ("organization_id","branch_id","cash_on");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_one_replacement" ON "gym"."expenses" USING btree ("organization_id","replaces_expense_id") WHERE "gym"."expenses"."replaces_expense_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_one_receipt" ON "gym"."expenses" USING btree ("organization_id","file_id") WHERE "gym"."expenses"."file_id" is not null;--> statement-breakpoint
CREATE INDEX "expense_branch_cash_idx" ON "gym"."expenses" USING btree ("organization_id","branch_id","paid_on","id");--> statement-breakpoint
CREATE INDEX "expense_category_idx" ON "gym"."expenses" USING btree ("organization_id","category_id","paid_on");--> statement-breakpoint
CREATE INDEX "private_files_branch_time_idx" ON "gym"."private_files" USING btree ("organization_id","branch_id","uploaded_at");