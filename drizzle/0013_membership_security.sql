ALTER TABLE gym.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.membership_freezes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.membership_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.invoices ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON gym.memberships,gym.membership_freezes,gym.membership_requests,gym.invoices TO gym_runtime;
GRANT UPDATE(end_on_exclusive,lifecycle,activated_at,cancelled_effective_on,version) ON gym.memberships TO gym_runtime;
GRANT UPDATE(reversed_at,reversed_by) ON gym.membership_freezes TO gym_runtime;
CREATE POLICY memberships_tenant ON gym.memberships TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY freezes_tenant ON gym.membership_freezes TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY membership_requests_tenant ON gym.membership_requests TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY invoices_tenant ON gym.invoices TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);

-- Serialize all period writes on the same member, including direct trusted SQL.
CREATE FUNCTION gym.check_membership_period() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
BEGIN
 PERFORM 1 FROM gym.members WHERE organization_id=NEW.organization_id AND id=NEW.member_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM gym.memberships m WHERE m.organization_id=NEW.organization_id AND m.member_id=NEW.member_id AND m.id<>NEW.id
 AND daterange(m.start_on,greatest(m.start_on,least(m.end_on_exclusive,coalesce(m.cancelled_effective_on,m.end_on_exclusive))),'[)') && daterange(NEW.start_on,greatest(NEW.start_on,least(NEW.end_on_exclusive,coalesce(NEW.cancelled_effective_on,NEW.end_on_exclusive))),'[)')) THEN
 RAISE EXCEPTION 'Membership period overlaps' USING ERRCODE='23514',CONSTRAINT='membership_no_overlap';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION gym.check_membership_period() FROM PUBLIC;
CREATE TRIGGER membership_period_guard BEFORE INSERT OR UPDATE OF start_on,end_on_exclusive,cancelled_effective_on,member_id,organization_id ON gym.memberships FOR EACH ROW EXECUTE FUNCTION gym.check_membership_period();
