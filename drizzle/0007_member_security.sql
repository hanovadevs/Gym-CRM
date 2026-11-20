REVOKE ALL ON gym.members,gym.number_counters FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON gym.members,gym.number_counters TO gym_runtime;
ALTER TABLE gym.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.number_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_tenant ON gym.members TO gym_runtime
USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY counters_tenant ON gym.number_counters TO gym_runtime
USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE INDEX members_created_by_idx ON gym.members(created_by);
CREATE INDEX members_updated_by_idx ON gym.members(updated_by);
