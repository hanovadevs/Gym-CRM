-- Tenant defense in depth; app services separately enforce roles and branch scope.
ALTER TABLE gym.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.plan_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON gym.plans TO gym_runtime;
GRANT UPDATE(revision,archived_at) ON gym.plans TO gym_runtime;
GRANT SELECT,INSERT ON gym.plan_versions TO gym_runtime;
CREATE POLICY plans_tenant ON gym.plans TO gym_runtime
USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY plan_versions_tenant ON gym.plan_versions TO gym_runtime
USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
-- All published versions are immutable, including ones not enrolled yet.
-- No UPDATE/DELETE on versions, no DELETE on plans, no identity/branch/code updates.
