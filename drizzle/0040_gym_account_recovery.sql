-- Keep primary gym login identity separate from the real owner contact.
INSERT INTO gym.gym_accounts(organization_id,auth_user_id,owner_email,created_by,updated_by)
SELECT DISTINCT ON(s.organization_id) s.organization_id,s.auth_user_id,
 CASE WHEN lower(u.email) !~ '[.](local|localhost|invalid|test)$' THEN lower(u.email) ELSE NULL END,s.auth_user_id,s.auth_user_id
FROM gym.staff_memberships s JOIN app_auth."user" u ON u.id=s.auth_user_id WHERE s.role='owner' AND s.active ORDER BY s.organization_id,s.auth_user_id;
GRANT SELECT,INSERT ON gym.gym_accounts TO gym_runtime;
GRANT UPDATE(owner_email,version,updated_by,updated_at) ON gym.gym_accounts TO gym_runtime;
ALTER TABLE gym.gym_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON gym.gym_accounts TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
--> statement-breakpoint
CREATE FUNCTION gym.guard_gym_account() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR (NEW.organization_id,NEW.auth_user_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.organization_id,OLD.auth_user_id,OLD.created_by,OLD.created_at)) THEN RAISE EXCEPTION 'Invalid primary gym account revision' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.version<>1 THEN RAISE EXCEPTION 'Invalid primary account version' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM gym.staff_memberships WHERE organization_id=NEW.organization_id AND auth_user_id=NEW.auth_user_id AND role='owner' AND active) THEN RAISE EXCEPTION 'Primary account must be an active gym owner' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gym_account_guard BEFORE INSERT OR UPDATE ON gym.gym_accounts FOR EACH ROW EXECUTE FUNCTION gym.guard_gym_account();
REVOKE ALL ON FUNCTION gym.guard_gym_account() FROM PUBLIC;
--> statement-breakpoint
-- Auth callbacks already identify the account. Return only that account's delivery destination.
CREATE FUNCTION gym.account_mail_target(p_user text) RETURNS TABLE(auth_user_id text,recipient_email text,organization_id uuid,gym_name text,login_email text,is_gym_account boolean)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT u.id,CASE WHEN a.auth_user_id IS NULL THEN u.email WHEN EXISTS(SELECT 1 FROM gym.staff_memberships s WHERE s.organization_id=a.organization_id AND s.auth_user_id=u.id AND s.role='owner' AND s.active) THEN a.owner_email ELSE NULL END,a.organization_id,o.name,u.email,a.auth_user_id IS NOT NULL
 FROM app_auth."user" u LEFT JOIN gym.gym_accounts a ON a.auth_user_id=u.id LEFT JOIN gym.organizations o ON o.id=a.organization_id WHERE u.id=p_user
$$;
REVOKE ALL ON FUNCTION gym.account_mail_target(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gym.account_mail_target(text) TO gym_runtime;
--> statement-breakpoint
-- Anonymous recovery stays neutral. A shared owner address requires an explicit gym login ID.
CREATE FUNCTION gym.recovery_account_identifier(p_email text,p_login text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result text; matches int;
BEGIN
 IF p_email IS NULL THEN RETURN NULL; END IF;
 IF nullif(btrim(p_login),'') IS NOT NULL THEN
  SELECT u.email INTO result FROM gym.gym_accounts a JOIN app_auth."user" u ON u.id=a.auth_user_id
  WHERE lower(u.email)=lower(btrim(p_login)) AND (lower(a.owner_email)=lower(btrim(p_email)) OR lower(u.email)=lower(btrim(p_email)))
  AND EXISTS(SELECT 1 FROM gym.staff_memberships s WHERE s.organization_id=a.organization_id AND s.auth_user_id=a.auth_user_id AND s.role='owner' AND s.active);
  RETURN result;
 END IF;
 SELECT u.email INTO result FROM app_auth."user" u WHERE lower(u.email)=lower(btrim(p_email));
 IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT count(*)::int,min(u.email) INTO matches,result FROM gym.gym_accounts a JOIN app_auth."user" u ON u.id=a.auth_user_id
 WHERE a.owner_email=lower(btrim(p_email)) AND EXISTS(SELECT 1 FROM gym.staff_memberships s WHERE s.organization_id=a.organization_id AND s.auth_user_id=a.auth_user_id AND s.role='owner' AND s.active);
 RETURN CASE WHEN matches=1 THEN result ELSE NULL END;
END $$;
REVOKE ALL ON FUNCTION gym.recovery_account_identifier(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gym.recovery_account_identifier(text,text) TO gym_runtime;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION platform.directory(p_user_id text,p_search text,p_page integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT platform.authorize(p_user_id) THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('total',(SELECT count(*) FROM gym.organizations o WHERE strpos(lower(o.name||' '||o.slug||' '||coalesce((SELECT u.email FROM gym.gym_accounts a JOIN app_auth."user" u ON u.id=a.auth_user_id WHERE a.organization_id=o.id),'')||' '||coalesce((SELECT a.owner_email FROM gym.gym_accounts a WHERE a.organization_id=o.id),'')),lower(p_search))>0),'gyms',coalesce(jsonb_agg(item ORDER BY name,id),'[]'::jsonb)) INTO result
 FROM(SELECT o.id,o.name,jsonb_build_object('id',o.id,'name',o.name,'slug',o.slug,'active',o.active,'version',o.settings_version,'email',coalesce((SELECT u.email FROM gym.gym_accounts a JOIN app_auth."user" u ON u.id=a.auth_user_id WHERE a.organization_id=o.id),o.email),'contactEmail',o.email,'ownerEmail',(SELECT a.owner_email FROM gym.gym_accounts a WHERE a.organization_id=o.id),'ownerName',(SELECT u.name FROM gym.gym_accounts a JOIN app_auth."user" u ON u.id=a.auth_user_id WHERE a.organization_id=o.id),'phone',o.phone,'address',o.address,'createdAt',o.created_at,
 'members',(SELECT count(*) FROM gym.members m WHERE m.organization_id=o.id AND m.archived_at IS NULL),'staff',(SELECT count(*) FROM gym.staff_memberships s WHERE s.organization_id=o.id AND s.active),'branches',(SELECT count(*) FROM gym.branches b WHERE b.organization_id=o.id AND b.active),'billing',platform.billing_summary(p_user_id,o.id)) item
 FROM gym.organizations o WHERE strpos(lower(o.name||' '||o.slug||' '||coalesce((SELECT u.email FROM gym.gym_accounts a JOIN app_auth."user" u ON u.id=a.auth_user_id WHERE a.organization_id=o.id),'')||' '||coalesce((SELECT a.owner_email FROM gym.gym_accounts a WHERE a.organization_id=o.id),'')),lower(p_search))>0 ORDER BY o.name,o.id LIMIT 15 OFFSET(greatest(1,least(p_page,10000))-1)*15)q;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION platform.directory(text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.directory(text,text,integer) TO gym_runtime;
