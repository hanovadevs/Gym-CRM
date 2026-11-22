-- Employee profiles and immutable payroll use the existing cash expense ledger.
GRANT SELECT,INSERT ON gym.employees,gym.payroll_charges,gym.payroll_payments,gym.payroll_requests TO gym_runtime;
GRANT UPDATE(branch_id,trainer_id,name,title,phone,email,start_on,active,salary_minor,currency,pay_day,version,updated_by,updated_at) ON gym.employees TO gym_runtime;
GRANT UPDATE(voided_at,voided_by,void_reason) ON gym.payroll_charges TO gym_runtime;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['employees','payroll_charges','payroll_payments','payroll_requests'] LOOP
  EXECUTE format('ALTER TABLE gym.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_scope ON gym.%I TO gym_runtime USING(organization_id=nullif(current_setting(''app.organization_id'',true),)::uuid) WITH CHECK(organization_id=nullif(current_setting(app.organization_id,true),)::uuid)',tab);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE VIEW gym.payroll_balances WITH(security_invoker=true) AS
 SELECT c.*,coalesce(p.paid,0)::numeric net_paid_minor,
 CASE WHEN c.voided_at IS NULL THEN c.amount_minor-coalesce(p.paid,0) ELSE 0 END::numeric balance_minor
 FROM gym.payroll_charges c LEFT JOIN LATERAL (
  SELECT sum(e.amount_minor) paid FROM gym.payroll_payments p JOIN gym.expenses e ON e.organization_id=p.organization_id AND e.id=p.expense_id
  WHERE p.organization_id=c.organization_id AND p.charge_id=c.id AND NOT EXISTS(SELECT 1 FROM gym.expense_reversals r WHERE r.organization_id=e.organization_id AND r.expense_id=e.id)
 ) p ON true;
GRANT SELECT ON gym.payroll_balances TO gym_runtime;
--> statement-breakpoint
CREATE FUNCTION gym.guard_employee() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR (NEW.organization_id,NEW.id,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.organization_id,OLD.id,OLD.created_by,OLD.created_at)) THEN RAISE EXCEPTION 'Invalid employee revision' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.version<>1 THEN RAISE EXCEPTION 'Invalid initial employee revision' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM gym.branches WHERE organization_id=NEW.organization_id AND id=NEW.branch_id AND active) THEN RAISE EXCEPTION 'Choose active employee branch' USING ERRCODE='23514'; END IF;
 IF NEW.trainer_id IS NOT NULL AND NEW.active THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-trainer:'||NEW.organization_id::text||':'||NEW.trainer_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM gym.trainers t JOIN gym.trainer_branches b ON b.organization_id=t.organization_id AND b.trainer_id=t.id WHERE t.organization_id=NEW.organization_id AND t.id=NEW.trainer_id AND t.active AND b.branch_id=NEW.branch_id AND b.active) THEN RAISE EXCEPTION 'Linked active trainer needs this branch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER employee_guard BEFORE INSERT OR UPDATE ON gym.employees FOR EACH ROW EXECUTE FUNCTION gym.guard_employee();
REVOKE ALL ON FUNCTION gym.guard_employee() FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION gym.guard_payroll() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE emp gym.employees; charge gym.payroll_charges; expense gym.expenses; paid numeric; local_today date;
BEGIN
 IF TG_TABLE_NAME='payroll_charges' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('payroll-charge:'||NEW.organization_id::text||':'||NEW.id::text,0));
  IF TG_OP='UPDATE' THEN
   IF OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL OR (NEW.organization_id,NEW.id,NEW.employee_id,NEW.branch_id,NEW.employee_name,NEW.employee_title,NEW.period,NEW.due_on,NEW.amount_minor,NEW.currency,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.organization_id,OLD.id,OLD.employee_id,OLD.branch_id,OLD.employee_name,OLD.employee_title,OLD.period,OLD.due_on,OLD.amount_minor,OLD.currency,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Payroll history is immutable' USING ERRCODE='23514'; END IF;
   SELECT net_paid_minor INTO paid FROM gym.payroll_balances WHERE organization_id=NEW.organization_id AND id=NEW.id;
   IF paid<>0 THEN RAISE EXCEPTION 'Reverse payments before voiding payroll' USING ERRCODE='23514'; END IF;
   NEW.voided_at:=clock_timestamp();
  ELSE
   SELECT * INTO emp FROM gym.employees WHERE organization_id=NEW.organization_id AND id=NEW.employee_id AND active FOR SHARE;
   IF emp.id IS NULL OR NEW.voided_at IS NOT NULL OR NEW.branch_id<>emp.branch_id OR NEW.currency<>emp.currency THEN RAISE EXCEPTION 'Choose active employee/current branch/currency' USING ERRCODE='23514'; END IF;
   SELECT (clock_timestamp() at time zone time_zone)::date INTO local_today FROM gym.organizations WHERE id=NEW.organization_id;
   IF NEW.period>date_trunc('month',local_today)+interval '12 months' OR NEW.period<date_trunc('month',emp.start_on) THEN RAISE EXCEPTION 'Payroll period outside employment range' USING ERRCODE='23514'; END IF;
   NEW.employee_name:=emp.name;NEW.employee_title:=emp.title;
  END IF;
 ELSE
  PERFORM pg_advisory_xact_lock(hashtextextended('payroll-charge:'||NEW.organization_id::text||':'||NEW.charge_id::text,0));
  SELECT * INTO charge FROM gym.payroll_charges WHERE organization_id=NEW.organization_id AND id=NEW.charge_id;
  SELECT * INTO expense FROM gym.expenses WHERE organization_id=NEW.organization_id AND id=NEW.expense_id;
  IF charge.id IS NULL OR charge.voided_at IS NOT NULL OR expense.id IS NULL OR expense.branch_id<>charge.branch_id OR expense.currency<>charge.currency OR expense.actor_id<>NEW.created_by OR EXISTS(SELECT 1 FROM gym.expense_reversals WHERE organization_id=NEW.organization_id AND expense_id=expense.id) THEN RAISE EXCEPTION 'Payroll payment expense unavailable' USING ERRCODE='23514'; END IF;
  SELECT net_paid_minor INTO paid FROM gym.payroll_balances WHERE organization_id=NEW.organization_id AND id=charge.id;
  IF paid+expense.amount_minor>charge.amount_minor THEN RAISE EXCEPTION 'Payroll payment exceeds remaining salary' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payroll_charge_guard BEFORE INSERT OR UPDATE ON gym.payroll_charges FOR EACH ROW EXECUTE FUNCTION gym.guard_payroll();
CREATE TRIGGER payroll_payment_guard BEFORE INSERT ON gym.payroll_payments FOR EACH ROW EXECUTE FUNCTION gym.guard_payroll();
REVOKE ALL ON FUNCTION gym.guard_payroll() FROM PUBLIC;
