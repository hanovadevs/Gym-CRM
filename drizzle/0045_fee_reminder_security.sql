ALTER TABLE gym.fee_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.fee_reminder_deliveries ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON gym.fee_reminder_settings,gym.fee_reminder_deliveries TO gym_runtime;
GRANT UPDATE(enabled,version,updated_by,updated_at) ON gym.fee_reminder_settings TO gym_runtime;
GRANT UPDATE(status,attempts,payload,error_code,started_at,sent_at) ON gym.fee_reminder_deliveries TO gym_runtime;
CREATE POLICY tenant_scope ON gym.fee_reminder_settings TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON gym.fee_reminder_deliveries TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
--> statement-breakpoint
-- Machine-authenticated server worker can enumerate eligible organization IDs only, never member rows.
CREATE FUNCTION gym.fee_reminder_organizations(p_after uuid DEFAULT NULL,p_limit int DEFAULT 100) RETURNS TABLE(organization_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT o.id FROM gym.organizations o JOIN gym.gym_accounts a ON a.organization_id=o.id JOIN gym.staff_memberships sm ON sm.organization_id=a.organization_id AND sm.auth_user_id=a.auth_user_id AND sm.role='owner' AND sm.active
 WHERE o.active AND a.owner_email IS NOT NULL AND (p_after IS NULL OR o.id>p_after) AND NOT EXISTS(SELECT 1 FROM gym.fee_reminder_settings s WHERE s.organization_id=o.id AND NOT s.enabled)
 ORDER BY o.id LIMIT greatest(1,least(coalesce(p_limit,100),1000))
$$;
REVOKE ALL ON FUNCTION gym.fee_reminder_organizations(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gym.fee_reminder_organizations(uuid,int) TO gym_runtime;
--> statement-breakpoint
CREATE FUNCTION gym.guard_fee_reminder_settings() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.organization_id<>OLD.organization_id OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'Invalid reminder settings revision' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' AND NEW.version<>1 THEN RAISE EXCEPTION 'Invalid initial reminder settings revision' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fee_reminder_settings_guard BEFORE INSERT OR UPDATE ON gym.fee_reminder_settings FOR EACH ROW EXECUTE FUNCTION gym.guard_fee_reminder_settings();
REVOKE ALL ON FUNCTION gym.guard_fee_reminder_settings() FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE VIEW gym.member_fee_due WITH(security_invoker=true) AS
 SELECT a.organization_id,a.id agreement_id,a.member_id,a.branch_id,m.name member_name,m.member_code,coalesce(unpaid.currency,a.currency) currency,a.amount_minor agreed_amount_minor,a.reminder_days,
 CASE WHEN unpaid.invoice_id IS NOT NULL THEN 'invoice' ELSE 'renewal' END due_kind,
 coalesce(unpaid.due_on,last_term.end_on_exclusive) due_on,
 coalesce(unpaid.balance_minor,a.amount_minor) amount_minor,unpaid.invoice_id,last_term.id membership_id,
 (now() at time zone o.time_zone)::date today,
 a.start_on
 FROM gym.member_fee_agreements a JOIN gym.members m ON m.organization_id=a.organization_id AND m.id=a.member_id
 JOIN gym.organizations o ON o.id=a.organization_id
 LEFT JOIN LATERAL(
  SELECT i.id invoice_id,i.due_on,b.balance_minor,i.currency FROM gym.member_fee_periods p JOIN gym.invoices i ON i.organization_id=p.organization_id AND i.membership_id=p.membership_id JOIN gym.invoice_balances b ON b.organization_id=i.organization_id AND b.invoice_id=i.id
  WHERE p.organization_id=a.organization_id AND p.member_id=a.member_id AND b.balance_minor>0 ORDER BY i.due_on,i.id LIMIT 1
 )unpaid ON true
 LEFT JOIN LATERAL(
  SELECT term.id,term.end_on_exclusive,term.cancelled_effective_on FROM gym.member_fee_periods p JOIN gym.memberships term ON term.organization_id=p.organization_id AND term.id=p.membership_id
  WHERE p.organization_id=a.organization_id AND p.agreement_id=a.id ORDER BY term.start_on DESC,term.created_at DESC,term.id DESC LIMIT 1
 )last_term ON true
 WHERE a.ended_at IS NULL AND (unpaid.invoice_id IS NOT NULL OR (m.archived_at IS NULL AND last_term.cancelled_effective_on IS NULL AND a.amount_minor>0));
GRANT SELECT ON gym.member_fee_due TO gym_runtime;
