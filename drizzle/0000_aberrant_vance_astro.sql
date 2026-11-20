CREATE SCHEMA "gym";
--> statement-breakpoint
CREATE SCHEMA "app_auth";
--> statement-breakpoint
CREATE TABLE "gym"."branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "branches_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "branches_organization_id_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
CREATE TABLE "gym"."organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"currency" text DEFAULT 'PKR' NOT NULL,
	"time_zone" text DEFAULT 'Asia/Karachi' NOT NULL,
	"locale" text DEFAULT 'en-PK' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "gym"."staff_branch_grants" (
	"organization_id" uuid NOT NULL,
	"staff_membership_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	CONSTRAINT "staff_branch_grants_organization_id_staff_membership_id_branch_id_unique" UNIQUE("organization_id","staff_membership_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "gym"."staff_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"auth_user_id" text NOT NULL,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "staff_memberships_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "staff_memberships_organization_id_auth_user_id_unique" UNIQUE("organization_id","auth_user_id"),
	CONSTRAINT "staff_role_check" CHECK ("gym"."staff_memberships"."role" in ('owner','manager','receptionist','trainer','accountant'))
);
--> statement-breakpoint
CREATE TABLE "app_auth"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_auth"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "app_auth"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "app_auth"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gym"."branches" ADD CONSTRAINT "branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."staff_branch_grants" ADD CONSTRAINT "staff_branch_grants_organization_id_staff_membership_id_staff_memberships_organization_id_id_fk" FOREIGN KEY ("organization_id","staff_membership_id") REFERENCES "gym"."staff_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."staff_branch_grants" ADD CONSTRAINT "staff_branch_grants_organization_id_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "gym"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."staff_memberships" ADD CONSTRAINT "staff_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "gym"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym"."staff_memberships" ADD CONSTRAINT "staff_memberships_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "app_auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_auth"."account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "app_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_auth"."session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "app_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "app_auth"."account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "app_auth"."session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "app_auth"."verification" USING btree ("identifier");