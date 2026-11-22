ALTER TABLE gym.member_fee_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.member_fee_periods ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON gym.member_fee_agreements,gym.member_fee_periods TO gym_runtime;
GRANT UPDATE(ended_at,ended_by,end_reason) ON gym.member_fee_agreements TO gym_runtime;
CREATE POLICY tenant_scope ON gym.member_fee_agreements TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON gym.member_fee_periods TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
--> statement-breakpoint
CREATE FUNCTION gym.guard_member_fee_agreement() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL OR (NEW.id,NEW.organization_id,NEW.member_id,NEW.branch_id,NEW.plan_id,NEW.amount_minor,NEW.currency,NEW.start_on,NEW.reminder_days,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.member_id,OLD.branch_id,OLD.plan_id,OLD.amount_minor,OLD.currency,OLD.start_on,OLD.reminder_days,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Fee agreement history is immutable' USING ERRCODE='23514';END IF;
 ELSE
  IF NEW.ended_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM gym.members m JOIN gym.plans p ON p.organization_id=m.organization_id AND p.branch_id=m.home_branch_id WHERE m.organization_id=NEW.organization_id AND m.id=NEW.member_id AND m.home_branch_id=NEW.branch_id AND m.archived_at IS NULL AND m.joined_on<=NEW.start_on AND p.id=NEW.plan_id AND p.archived_at IS NULL) THEN RAISE EXCEPTION 'Active member and matching branch plan required' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER member_fee_agreement_guard BEFORE INSERT OR UPDATE ON gym.member_fee_agreements FOR EACH ROW EXECUTE FUNCTION gym.guard_member_fee_agreement();
REVOKE ALL ON FUNCTION gym.guard_member_fee_agreement() FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION gym.guard_member_fee_period() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE agreement gym.member_fee_agreements; term gym.memberships;
BEGIN
 SELECT * INTO agreement FROM gym.member_fee_agreements WHERE organization_id=NEW.organization_id AND id=NEW.agreement_id FOR SHARE;
 SELECT * INTO term FROM gym.memberships WHERE organization_id=NEW.organization_id AND id=NEW.membership_id FOR SHARE;
 IF agreement.id IS NULL OR term.id IS NULL OR agreement.ended_at IS NOT NULL OR term.start_on<agreement.start_on OR term.snapshot->>'planId'<>agreement.plan_id::text OR term.snapshot->>'durationUnit'<>'months' OR term.snapshot->>'durationCount'<>'1' THEN RAISE EXCEPTION 'Monthly term and current fee agreement required' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER member_fee_period_guard BEFORE INSERT ON gym.member_fee_periods FOR EACH ROW EXECUTE FUNCTION gym.guard_member_fee_period();
REVOKE ALL ON FUNCTION gym.guard_member_fee_period() FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION gym.require_member_fee_first_period() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM gym.member_fee_periods p JOIN gym.memberships m ON m.organization_id=p.organization_id AND m.id=p.membership_id WHERE p.organization_id=NEW.organization_id AND p.agreement_id=NEW.id AND m.start_on=NEW.start_on) THEN RAISE EXCEPTION 'Fee agreement requires its first monthly term in the same transaction' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER member_fee_first_period AFTER INSERT ON gym.member_fee_agreements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION gym.require_member_fee_first_period();
REVOKE ALL ON FUNCTION gym.require_member_fee_first_period() FROM PUBLIC;
--> statement-breakpoint
-- Unpaid invoices and renewal reminders are distinct: an unissued renewal is not debt.
CREATE VIEW gym.member_fee_due WITH(security_invoker=true) AS
 SELECT a.organization_id,a.id agreement_id,a.member_id,a.branch_id,m.name member_name,m.member_code,a.currency,a.amount_minor agreed_amount_minor,a.reminder_days,
 CASE WHEN unpaid.invoice_id IS NOT NULL THEN 'invoice' ELSE 'renewal' END due_kind,
 coalesce(unpaid.due_on,last_term.end_on_exclusive) due_on,
 coalesce(unpaid.balance_minor,a.amount_minor) amount_minor,unpaid.invoice_id,last_term.id membership_id,
 (now() at time zone o.time_zone)::date today,
 a.start_on
 FROM gym.member_fee_agreements a JOIN gym.members m ON m.organization_id=a.organization_id AND m.id=a.member_id
 JOIN gym.organizations o ON o.id=a.organization_id
 LEFT JOIN LATERAL(
  SELECT i.id invoice_id,i.due_on,b.balance_minor FROM gym.member_fee_periods p JOIN gym.invoices i ON i.organization_id=p.organization_id AND i.membership_id=p.membership_id JOIN gym.invoice_balances b ON b.organization_id=i.organization_id AND b.invoice_id=i.id
  WHERE p.organization_id=a.organization_id AND p.agreement_id=a.id AND b.balance_minor>0 ORDER BY i.due_on,i.id LIMIT 1
 )unpaid ON true
 LEFT JOIN LATERAL(
  SELECT term.id,term.end_on_exclusive,term.cancelled_effective_on FROM gym.member_fee_periods p JOIN gym.memberships term ON term.organization_id=p.organization_id AND term.id=p.membership_id
  WHERE p.organization_id=a.organization_id AND p.agreement_id=a.id ORDER BY term.start_on DESC,term.created_at DESC,term.id DESC LIMIT 1
 )last_term ON true
 WHERE a.ended_at IS NULL AND (unpaid.invoice_id IS NOT NULL OR (m.archived_at IS NULL AND last_term.cancelled_effective_on IS NULL AND a.amount_minor>0));
GRANT SELECT ON gym.member_fee_due TO gym_runtime;
