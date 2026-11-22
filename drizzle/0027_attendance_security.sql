GRANT SELECT ON gym.attendance_visits,gym.attendance_requests,gym.member_access_tokens TO gym_runtime;
GRANT INSERT(organization_id,member_id,branch_id,membership_id,checked_in_by,eligibility_snapshot,override_actor_id,override_reason) ON gym.attendance_visits TO gym_runtime;
GRANT UPDATE(checked_out_at,checked_out_by) ON gym.attendance_visits TO gym_runtime;
GRANT INSERT ON gym.attendance_requests,gym.member_access_tokens TO gym_runtime;
ALTER TABLE gym.attendance_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.attendance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.member_access_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_scope ON gym.attendance_visits TO gym_runtime
USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON gym.attendance_requests TO gym_runtime
USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON gym.member_access_tokens TO gym_runtime
USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
--> statement-breakpoint
-- Serialize new visit openings with member archival/lifecycle operations.
-- Historical restore loads data before post-data triggers; operational writes
-- always use the restricted role and cannot supply their own entry timestamp.
CREATE FUNCTION gym.guard_attendance_visit() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE archived timestamptz;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT archived_at INTO archived FROM gym.members WHERE organization_id=NEW.organization_id AND id=NEW.member_id FOR UPDATE;
    IF NOT FOUND OR archived IS NOT NULL THEN RAISE EXCEPTION 'Member is unavailable for check-in' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM gym.branches WHERE organization_id=NEW.organization_id AND id=NEW.branch_id AND active) THEN RAISE EXCEPTION 'Active branch required' USING ERRCODE='23514'; END IF;
    IF NEW.membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM gym.memberships WHERE organization_id=NEW.organization_id AND id=NEW.membership_id AND member_id=NEW.member_id) THEN RAISE EXCEPTION 'Membership identity mismatch' USING ERRCODE='23514'; END IF;
    IF current_user='gym_runtime' AND (NEW.checked_out_at IS NOT NULL OR NEW.checked_out_by IS NOT NULL) THEN RAISE EXCEPTION 'A new visit must be open' USING ERRCODE='23514'; END IF;
  ELSE
    IF OLD.checked_out_at IS NOT NULL OR NEW.checked_out_at IS NULL OR NEW.checked_out_by IS NULL THEN RAISE EXCEPTION 'Visit checkout is immutable and must identify an actor' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER attendance_visit_guard BEFORE INSERT OR UPDATE ON gym.attendance_visits FOR EACH ROW EXECUTE FUNCTION gym.guard_attendance_visit();
REVOKE ALL ON FUNCTION gym.guard_attendance_visit() FROM PUBLIC;
