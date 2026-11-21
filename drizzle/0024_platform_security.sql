-- Platform grants are explicit, migration-operator-managed and never tenant roles.
REVOKE ALL ON SCHEMA platform FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA platform FROM PUBLIC;
GRANT USAGE ON SCHEMA platform TO gym_runtime;
ALTER TABLE platform.administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION platform.authorize(p_user_id text) RETURNS boolean
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE permitted boolean;
BEGIN
  SELECT active INTO permitted FROM platform.administrators WHERE user_id=p_user_id FOR SHARE;
  RETURN coalesce(permitted,false);
END $$;
REVOKE ALL ON FUNCTION platform.authorize(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.authorize(text) TO gym_runtime;
--> statement-breakpoint
GRANT SELECT,INSERT ON platform.events TO gym_runtime;
CREATE POLICY platform_event_scope ON platform.events TO gym_runtime
USING (actor_user_id=nullif(current_setting('app.platform_user_id',true),'') AND platform.authorize(actor_user_id))
WITH CHECK (actor_user_id=nullif(current_setting('app.platform_user_id',true),'') AND platform.authorize(actor_user_id)
  AND organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
--> statement-breakpoint
CREATE FUNCTION platform.directory(p_user_id text,p_search text,p_page integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF NOT platform.authorize(p_user_id) THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('total',(SELECT count(*) FROM gym.organizations o WHERE
    strpos(lower(o.name||' '||o.slug),lower(p_search))>0),'gyms',coalesce(jsonb_agg(item ORDER BY name,id),'[]'::jsonb)) INTO result
  FROM (SELECT o.id,o.name,jsonb_build_object('id',o.id,'name',o.name,'slug',o.slug,'active',o.active,
    'version',o.settings_version,'email',o.email,'createdAt',o.created_at,
    'members',(SELECT count(*) FROM gym.members m WHERE m.organization_id=o.id AND m.archived_at IS NULL),
    'staff',(SELECT count(*) FROM gym.staff_memberships s WHERE s.organization_id=o.id AND s.active),
    'branches',(SELECT count(*) FROM gym.branches b WHERE b.organization_id=o.id AND b.active)) item
    FROM gym.organizations o WHERE strpos(lower(o.name||' '||o.slug),lower(p_search))>0
    ORDER BY o.name,o.id LIMIT 15 OFFSET (greatest(1,least(p_page,10000))-1)*15) q;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION platform.directory(text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.directory(text,text,integer) TO gym_runtime;
--> statement-breakpoint
CREATE FUNCTION platform.activity(p_user_id text,p_organization_id uuid,p_page integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF p_user_id IS NULL OR NOT platform.authorize(p_user_id) THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
  WITH events AS (
    SELECT a.id,a.organization_id,a.actor_user_id,a.action,a.reason,a.occurred_at,'gym' source FROM gym.audit_events a
    WHERE p_organization_id IS NULL OR a.organization_id=p_organization_id
    UNION ALL
    SELECT a.id,a.organization_id,a.actor_user_id,a.action,a.reason,a.occurred_at,'platform' source FROM platform.events a
    WHERE p_organization_id IS NULL OR a.organization_id=p_organization_id
  ), selected AS (SELECT * FROM events ORDER BY occurred_at DESC,id DESC LIMIT 20 OFFSET (greatest(1,least(p_page,10000))-1)*20)
  SELECT jsonb_build_object('total',(SELECT count(*) FROM events),'events',coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'organizationId',e.organization_id,'gymName',o.name,'actor',u.name,'action',e.action,
    'reason',e.reason,'occurredAt',e.occurred_at,'source',e.source) ORDER BY e.occurred_at DESC,e.id DESC),'[]'::jsonb)) INTO result
  FROM selected e JOIN gym.organizations o ON o.id=e.organization_id JOIN app_auth."user" u ON u.id=e.actor_user_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION platform.activity(text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.activity(text,uuid,integer) TO gym_runtime;
--> statement-breakpoint
-- Suspended gyms disappear from ordinary staff access without altering memberships.
CREATE OR REPLACE FUNCTION gym.staff_directory(p_user_id text)
RETURNS TABLE (organization_id uuid, membership_id uuid, organization_name text)
LANGUAGE sql STABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
  SELECT s.organization_id,s.id,o.name FROM gym.staff_memberships s
  JOIN gym.organizations o ON o.id=s.organization_id
  WHERE s.auth_user_id=p_user_id AND s.active AND o.active AND EXISTS (
    SELECT 1 FROM gym.branches b WHERE b.organization_id=s.organization_id AND b.active
    AND (s.role='owner' OR EXISTS (SELECT 1 FROM gym.staff_branch_grants g
      WHERE g.organization_id=s.organization_id AND g.staff_membership_id=s.id AND g.branch_id=b.id)))
  ORDER BY o.name,s.organization_id
$$;
REVOKE ALL ON FUNCTION gym.staff_directory(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gym.staff_directory(text) TO gym_runtime;
