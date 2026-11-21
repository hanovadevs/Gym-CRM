-- Custom SQL migration file, put your code below! --
ALTER TABLE gym.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.payment_allocations ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON gym.payments,gym.payment_allocations TO gym_runtime;
CREATE POLICY payments_tenant ON gym.payments TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY allocations_tenant ON gym.payment_allocations TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);

CREATE OR REPLACE VIEW gym.invoice_balances WITH(security_invoker=true) AS
 SELECT i.organization_id,i.id AS invoice_id,i.currency,
 CASE WHEN i.status='issued' THEN i.total_minor-coalesce((SELECT sum(a.amount_minor)::bigint FROM gym.payment_allocations a WHERE a.organization_id=i.organization_id AND a.invoice_id=i.id),0::bigint) ELSE 0::bigint END AS balance_minor
 FROM gym.invoices i;

CREATE FUNCTION gym.guard_payment() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE inv gym.invoices; organization gym.organizations; balance bigint; today date;
BEGIN
 -- Acquire the immutable invoice row before a separate, fresh balance query.
 SELECT * INTO inv FROM gym.invoices WHERE organization_id=NEW.organization_id AND id=NEW.invoice_id FOR UPDATE;
 IF NOT FOUND OR inv.status<>'issued' THEN RAISE EXCEPTION 'An issued invoice is required' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM gym.payments p WHERE p.organization_id=NEW.organization_id AND p.invoice_id=NEW.invoice_id AND NOT EXISTS(SELECT 1 FROM gym.payment_allocations a WHERE a.organization_id=p.organization_id AND a.payment_id=p.id)) THEN
  RAISE EXCEPTION 'Complete the previous allocation first' USING ERRCODE='23514';
 END IF;
 SELECT balance_minor INTO balance FROM gym.invoice_balances WHERE organization_id=NEW.organization_id AND invoice_id=NEW.invoice_id;
 IF NEW.amount_minor<=0 OR NEW.amount_minor>balance THEN RAISE EXCEPTION 'Payment exceeds remaining balance' USING ERRCODE='23514',CONSTRAINT='payment_balance_cap'; END IF;
 SELECT * INTO organization FROM gym.organizations WHERE id=NEW.organization_id;
 today:=(current_timestamp AT TIME ZONE organization.time_zone)::date;
 IF NEW.paid_on<inv.issued_on OR NEW.paid_on>today OR length(btrim(NEW.receipt_number)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Invalid payment date or receipt number' USING ERRCODE='23514'; END IF;
 NEW.balance_after_minor:=balance-NEW.amount_minor;
 NEW.receipt_snapshot:=jsonb_build_object('issuer',jsonb_build_object('name',organization.name,'address',organization.address,'email',organization.email,'phone',organization.phone,'footer',organization.receipt_footer,'locale',organization.locale,'timeZone',organization.time_zone),
  'recipientName',inv.recipient_name,'recipientCode',inv.recipient_code,'branchName',inv.branch_name,'invoiceNumber',inv.number,'description',inv.description,'invoiceTotalMinor',inv.total_minor::text,'currency',inv.currency);
 RETURN NEW;
END $$;
CREATE TRIGGER payment_guard BEFORE INSERT ON gym.payments FOR EACH ROW EXECUTE FUNCTION gym.guard_payment();

CREATE FUNCTION gym.guard_payment_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE inv gym.invoices; total numeric;
BEGIN
 SELECT * INTO inv FROM gym.invoices WHERE organization_id=NEW.organization_id AND id=NEW.invoice_id FOR UPDATE;
 IF NOT FOUND OR inv.status<>'issued' THEN RAISE EXCEPTION 'An issued invoice is required' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(amount_minor),0)+NEW.amount_minor INTO total FROM gym.payment_allocations WHERE organization_id=NEW.organization_id AND invoice_id=NEW.invoice_id;
 IF total>inv.total_minor THEN RAISE EXCEPTION 'Allocations exceed invoice total' USING ERRCODE='23514',CONSTRAINT='allocation_balance_cap'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER allocation_guard BEFORE INSERT ON gym.payment_allocations FOR EACH ROW EXECUTE FUNCTION gym.guard_payment_allocation();

CREATE FUNCTION gym.check_payment_complete() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE payment_key uuid; parent gym.payments; allocation_count int; allocated numeric;
BEGIN
 IF TG_TABLE_NAME='payments' THEN payment_key:=NEW.id; ELSE payment_key:=NEW.payment_id; END IF;
 SELECT * INTO parent FROM gym.payments WHERE organization_id=NEW.organization_id AND id=payment_key;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT count(*),coalesce(sum(amount_minor),0) INTO allocation_count,allocated FROM gym.payment_allocations WHERE organization_id=parent.organization_id AND payment_id=parent.id;
 IF allocation_count<>1 OR allocated<>parent.amount_minor THEN RAISE EXCEPTION 'Payment must be fully allocated to its invoice' USING ERRCODE='23514',CONSTRAINT='payment_fully_allocated'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER payment_complete AFTER INSERT ON gym.payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION gym.check_payment_complete();
CREATE CONSTRAINT TRIGGER allocation_complete AFTER INSERT ON gym.payment_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION gym.check_payment_complete();
REVOKE ALL ON FUNCTION gym.guard_payment(),gym.guard_payment_allocation(),gym.check_payment_complete() FROM PUBLIC;
