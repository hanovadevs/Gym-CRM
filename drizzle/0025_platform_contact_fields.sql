-- Existing gym contact columns are now available in the platform directory DTO.
CREATE OR REPLACE FUNCTION platform.directory(p_user_id text,p_search text,p_page integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF NOT platform.authorize(p_user_id) THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('total',(SELECT count(*) FROM gym.organizations o WHERE
    strpos(lower(o.name||' '||o.slug),lower(p_search))>0),'gyms',coalesce(jsonb_agg(item ORDER BY name,id),'[]'::jsonb)) INTO result
  FROM (SELECT o.id,o.name,jsonb_build_object('id',o.id,'name',o.name,'slug',o.slug,'active',o.active,
    'version',o.settings_version,'email',o.email,'phone',o.phone,'address',o.address,'createdAt',o.created_at,
    'members',(SELECT count(*) FROM gym.members m WHERE m.organization_id=o.id AND m.archived_at IS NULL),
    'staff',(SELECT count(*) FROM gym.staff_memberships s WHERE s.organization_id=o.id AND s.active),
    'branches',(SELECT count(*) FROM gym.branches b WHERE b.organization_id=o.id AND b.active)) item
    FROM gym.organizations o WHERE strpos(lower(o.name||' '||o.slug),lower(p_search))>0
    ORDER BY o.name,o.id LIMIT 15 OFFSET (greatest(1,least(p_page,10000))-1)*15) q;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION platform.directory(text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.directory(text,text,integer) TO gym_runtime;
