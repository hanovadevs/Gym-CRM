-- Custom SQL migration file, put your code below! --
GRANT SELECT,INSERT ON gym.expenses,gym.expense_reversals,gym.private_files TO gym_runtime;
GRANT SELECT,INSERT ON gym.expense_categories TO gym_runtime;
GRANT UPDATE(name,normalized_name,active,version,updated_by,updated_at) ON gym.expense_categories TO gym_runtime;
ALTER TABLE gym.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.expense_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.private_files ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_scope ON gym.expenses TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON gym.expense_reversals TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON gym.expense_categories TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON gym.private_files TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
--> statement-breakpoint
CREATE FUNCTION gym.guard_expense() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE local_today date; original_paid date;
BEGIN
 SELECT (clock_timestamp() at time zone time_zone)::date INTO local_today FROM gym.organizations WHERE id=NEW.organization_id;
 IF NOT EXISTS(SELECT 1 FROM gym.branches WHERE organization_id=NEW.organization_id AND id=NEW.branch_id AND active) THEN RAISE EXCEPTION 'Active expense branch required' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='expenses' THEN
  IF NEW.paid_on>local_today THEN RAISE EXCEPTION 'Expense cash date cannot be future' USING ERRCODE='23514'; END IF;
  SELECT name INTO NEW.category_name FROM gym.expense_categories WHERE organization_id=NEW.organization_id AND id=NEW.category_id AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active expense category required' USING ERRCODE='23514'; END IF;
  IF NEW.file_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM gym.private_files WHERE organization_id=NEW.organization_id AND id=NEW.file_id AND branch_id=NEW.branch_id AND uploaded_by=NEW.actor_id AND purpose='expense_receipt') THEN RAISE EXCEPTION 'Expense receipt unavailable' USING ERRCODE='23514'; END IF;
  IF NEW.replaces_expense_id IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('expense:'||NEW.organization_id::text||':'||NEW.replaces_expense_id::text,0));
   IF NOT EXISTS(SELECT 1 FROM gym.expense_reversals WHERE organization_id=NEW.organization_id AND expense_id=NEW.replaces_expense_id AND branch_id=NEW.branch_id) THEN RAISE EXCEPTION 'Reverse expense before replacement' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  PERFORM pg_advisory_xact_lock(hashtextextended('expense:'||NEW.organization_id::text||':'||NEW.expense_id::text,0));
  SELECT paid_on INTO original_paid FROM gym.expenses WHERE organization_id=NEW.organization_id AND id=NEW.expense_id AND branch_id=NEW.branch_id;
  IF NOT FOUND OR NEW.cash_on<original_paid OR NEW.cash_on>local_today THEN RAISE EXCEPTION 'Invalid expense reversal cash date' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER expense_guard BEFORE INSERT ON gym.expenses FOR EACH ROW EXECUTE FUNCTION gym.guard_expense();
CREATE TRIGGER expense_reversal_guard BEFORE INSERT ON gym.expense_reversals FOR EACH ROW EXECUTE FUNCTION gym.guard_expense();
REVOKE ALL ON FUNCTION gym.guard_expense() FROM PUBLIC;
