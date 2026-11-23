-- A user with another accessible gym must not get stuck on a membership whose
-- last active branch grant has been revoked. Exclude unusable choices up front.
CREATE OR REPLACE FUNCTION gym.staff_directory(p_user_id text)
RETURNS TABLE (organization_id uuid, membership_id uuid, organization_name text)
LANGUAGE sql STABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT s.organization_id, s.id, o.name
  FROM gym.staff_memberships AS s
  JOIN gym.organizations AS o ON o.id = s.organization_id
  WHERE s.auth_user_id = p_user_id AND s.active = true
    AND EXISTS (
      SELECT 1 FROM gym.branches AS b
      WHERE b.organization_id = s.organization_id AND b.active = true
        AND (s.role = 'owner' OR EXISTS (
          SELECT 1 FROM gym.staff_branch_grants AS g
          WHERE g.organization_id = s.organization_id
            AND g.staff_membership_id = s.id AND g.branch_id = b.id
        ))
    )
  ORDER BY o.name, s.organization_id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gym.staff_directory(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gym.staff_directory(text) TO gym_runtime;
