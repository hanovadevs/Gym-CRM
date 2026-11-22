-- Wait for contact changes before choosing a reset delivery target. The auth framework still owns tokens.
CREATE OR REPLACE FUNCTION gym.account_mail_target(p_user text) RETURNS TABLE(auth_user_id text,recipient_email text,organization_id uuid,gym_name text,login_email text,is_gym_account boolean)
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE account gym.gym_accounts; identity_email text; owner_active boolean;
BEGIN
 SELECT u.email INTO identity_email FROM app_auth."user" u WHERE u.id=p_user;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT a.* INTO account FROM gym.gym_accounts a WHERE a.auth_user_id=p_user FOR SHARE;
 IF NOT FOUND THEN
  RETURN QUERY SELECT p_user,identity_email,NULL::uuid,NULL::text,identity_email,false;RETURN;
 END IF;
 PERFORM s.id FROM gym.staff_memberships s WHERE s.organization_id=account.organization_id AND s.auth_user_id=p_user AND s.role='owner' AND s.active FOR SHARE;
 owner_active:=FOUND;
 RETURN QUERY SELECT p_user,CASE WHEN owner_active THEN account.owner_email ELSE NULL END,account.organization_id,o.name,identity_email,true FROM gym.organizations o WHERE o.id=account.organization_id;
END $$;
REVOKE ALL ON FUNCTION gym.account_mail_target(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gym.account_mail_target(text) TO gym_runtime;
