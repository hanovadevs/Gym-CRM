-- A primary gym login must retain the owner role needed for recovery and notifications.
CREATE FUNCTION gym.guard_primary_gym_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM gym.gym_accounts a WHERE a.organization_id=OLD.organization_id AND a.auth_user_id=OLD.auth_user_id) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Primary gym owner cannot be removed' USING ERRCODE='23514';END IF;
  IF NOT NEW.active OR NEW.role<>'owner' OR (NEW.organization_id,NEW.auth_user_id) IS DISTINCT FROM (OLD.organization_id,OLD.auth_user_id) THEN RAISE EXCEPTION 'Primary gym login must remain an active owner' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER primary_gym_owner_guard BEFORE UPDATE OR DELETE ON gym.staff_memberships FOR EACH ROW EXECUTE FUNCTION gym.guard_primary_gym_owner();
REVOKE ALL ON FUNCTION gym.guard_primary_gym_owner() FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION gym.guard_gym_account() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR (NEW.organization_id,NEW.auth_user_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.organization_id,OLD.auth_user_id,OLD.created_by,OLD.created_at)) THEN RAISE EXCEPTION 'Invalid primary gym account revision' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.version<>1 THEN RAISE EXCEPTION 'Invalid primary account version' USING ERRCODE='23514'; END IF;
 PERFORM id FROM gym.staff_memberships WHERE organization_id=NEW.organization_id AND auth_user_id=NEW.auth_user_id AND role='owner' AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Primary account must be an active gym owner' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION gym.guard_gym_account() FROM PUBLIC;
