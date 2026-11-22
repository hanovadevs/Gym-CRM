CREATE OR REPLACE FUNCTION gym.require_agreed_fee_term() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE v_agreement_id uuid;
BEGIN
 SELECT id INTO v_agreement_id FROM gym.member_fee_agreements WHERE organization_id=NEW.organization_id AND member_id=NEW.member_id AND ended_at IS NULL FOR SHARE;
 IF v_agreement_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM gym.member_fee_periods p WHERE p.organization_id=NEW.organization_id AND p.membership_id=NEW.id AND p.agreement_id=v_agreement_id) THEN RAISE EXCEPTION 'A new monthly term must retain the current agreed member fee' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION gym.require_agreed_fee_term() FROM PUBLIC;
