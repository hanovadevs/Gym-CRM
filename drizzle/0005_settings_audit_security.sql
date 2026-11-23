REVOKE ALL ON gym.audit_events FROM PUBLIC;
GRANT SELECT,INSERT ON gym.audit_events TO gym_runtime;
ALTER TABLE gym.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_tenant_read ON gym.audit_events FOR SELECT TO gym_runtime
USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY audit_tenant_insert ON gym.audit_events FOR INSERT TO gym_runtime
WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
--> statement-breakpoint
ALTER TABLE gym.organizations ADD CONSTRAINT organization_policy_bounds CHECK (grace_days BETWEEN 0 AND 30 AND settings_version>0 AND currency ~ '^[A-Z]{3}$');
ALTER TABLE gym.branches ADD CONSTRAINT branch_version_positive CHECK (version>0);
ALTER TABLE gym.staff_memberships ADD CONSTRAINT staff_version_positive CHECK (version>0);
