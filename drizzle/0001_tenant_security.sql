-- Runtime is provisioned separately from table ownership. No default grants to future tables.
REVOKE ALL ON SCHEMA gym, app_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA gym, app_auth TO gym_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app_auth TO gym_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON gym.organizations, gym.branches, gym.staff_memberships, gym.staff_branch_grants TO gym_runtime;
--> statement-breakpoint
ALTER TABLE gym.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.staff_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.staff_branch_grants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_scope ON gym.organizations TO gym_runtime
USING (id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY tenant_scope ON gym.branches TO gym_runtime
USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY tenant_scope ON gym.staff_memberships TO gym_runtime
USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY tenant_scope ON gym.staff_branch_grants TO gym_runtime
USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
