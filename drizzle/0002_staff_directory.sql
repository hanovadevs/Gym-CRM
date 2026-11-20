-- Trusted-server bootstrap only: caller ID comes from a validated app session.
-- This exposes no directory table or unrestricted business view.
CREATE FUNCTION gym.staff_directory(p_user_id text)
RETURNS TABLE (organization_id uuid, membership_id uuid, organization_name text)
LANGUAGE sql STABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT s.organization_id, s.id, o.name
  FROM gym.staff_memberships AS s
  JOIN gym.organizations AS o ON o.id = s.organization_id
  WHERE s.auth_user_id = p_user_id AND s.active = true
  ORDER BY o.name, s.organization_id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gym.staff_directory(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gym.staff_directory(text) TO gym_runtime;
