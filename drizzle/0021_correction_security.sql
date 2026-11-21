ALTER TABLE gym.financial_corrections ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON gym.financial_corrections TO gym_runtime;
CREATE POLICY corrections_tenant ON gym.financial_corrections TO gym_runtime
 USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);

CREATE OR REPLACE VIEW gym.invoice_balances WITH(security_invoker=true) AS
 SELECT i.organization_id,i.id AS invoice_id,i.currency,
 CASE WHEN i.status='issued' AND NOT EXISTS(SELECT 1 FROM gym.financial_corrections c WHERE c.organization_id=i.organization_id AND c.invoice_id=i.id AND c.kind='void')
 THEN i.total_minor
 -coalesce((SELECT sum(c.amount_minor)::bigint FROM gym.financial_corrections c WHERE c.organization_id=i.organization_id AND c.invoice_id=i.id AND c.kind IN('credit','refund_credit')),0::bigint)
 -coalesce((SELECT sum(a.amount_minor)::bigint FROM gym.payment_allocations a WHERE a.organization_id=i.organization_id AND a.invoice_id=i.id),0::bigint)
 +coalesce((SELECT sum(c.amount_minor)::bigint FROM gym.financial_corrections c WHERE c.organization_id=i.organization_id AND c.invoice_id=i.id AND c.kind IN('refund','refund_credit')),0::bigint)
 ELSE 0::bigint END AS balance_minor FROM gym.invoices i;

CREATE FUNCTION gym.guard_correction() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE inv gym.invoices; pay gym.payments; balance bigint; refundable bigint; credited bigint; today date;
BEGIN
 SELECT * INTO inv FROM gym.invoices WHERE organization_id=NEW.organization_id AND id=NEW.invoice_id FOR UPDATE;
 IF NOT FOUND OR inv.status<>'issued' THEN RAISE EXCEPTION 'Issued invoice required' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM gym.financial_corrections WHERE organization_id=NEW.organization_id AND invoice_id=NEW.invoice_id AND kind='void') THEN RAISE EXCEPTION 'Invoice is void' USING ERRCODE='23514'; END IF;
 SELECT balance_minor INTO balance FROM gym.invoice_balances WHERE organization_id=NEW.organization_id AND invoice_id=NEW.invoice_id;
 SELECT (current_timestamp AT TIME ZONE time_zone)::date INTO today FROM gym.organizations WHERE id=NEW.organization_id;
 IF NEW.cash_on<inv.issued_on OR NEW.cash_on>today THEN RAISE EXCEPTION 'Invalid correction date' USING ERRCODE='23514'; END IF;
 IF NEW.kind='void' THEN
  IF EXISTS(SELECT 1 FROM gym.payments WHERE organization_id=NEW.organization_id AND invoice_id=NEW.invoice_id) OR EXISTS(SELECT 1 FROM gym.financial_corrections WHERE organization_id=NEW.organization_id AND invoice_id=NEW.invoice_id) THEN RAISE EXCEPTION 'Invoice with financial history cannot be voided' USING ERRCODE='23514'; END IF;
  NEW.balance_after_minor:=0;
 ELSE
  IF NEW.kind IN('refund','refund_credit') THEN
   SELECT * INTO pay FROM gym.payments WHERE organization_id=NEW.organization_id AND id=NEW.payment_id;
   IF NOT FOUND OR pay.invoice_id<>NEW.invoice_id OR NEW.cash_on<pay.paid_on THEN RAISE EXCEPTION 'Invalid original payment' USING ERRCODE='23514'; END IF;
   SELECT pay.amount_minor-coalesce(sum(amount_minor),0)::bigint INTO refundable FROM gym.financial_corrections WHERE organization_id=NEW.organization_id AND payment_id=NEW.payment_id AND kind IN('refund','refund_credit');
   IF NEW.amount_minor>refundable THEN RAISE EXCEPTION 'Refund exceeds original payment remaining amount' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT coalesce(sum(amount_minor),0)::bigint INTO credited FROM gym.financial_corrections WHERE organization_id=NEW.organization_id AND invoice_id=NEW.invoice_id AND kind IN('credit','refund_credit');
  IF NEW.kind IN('credit','refund_credit') AND (NEW.amount_minor>inv.total_minor-credited OR (NEW.kind='credit' AND NEW.amount_minor>balance)) THEN RAISE EXCEPTION 'Credit exceeds available charge or balance' USING ERRCODE='23514'; END IF;
  NEW.balance_after_minor:=balance+CASE WHEN NEW.kind='refund' THEN NEW.amount_minor WHEN NEW.kind='credit' THEN -NEW.amount_minor ELSE 0 END;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER correction_guard BEFORE INSERT ON gym.financial_corrections FOR EACH ROW EXECUTE FUNCTION gym.guard_correction();
REVOKE ALL ON FUNCTION gym.guard_correction() FROM PUBLIC;

-- Refunded funds reopen debt and may be collected again. Compare the current
-- net balance, rather than lifetime gross allocations, after acquiring the lock.
CREATE OR REPLACE FUNCTION gym.guard_payment_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE inv gym.invoices; balance bigint;
BEGIN
 SELECT * INTO inv FROM gym.invoices WHERE organization_id=NEW.organization_id AND id=NEW.invoice_id FOR UPDATE;
 IF NOT FOUND OR inv.status<>'issued' THEN RAISE EXCEPTION 'Issued invoice required' USING ERRCODE='23514'; END IF;
 SELECT balance_minor INTO balance FROM gym.invoice_balances WHERE organization_id=NEW.organization_id AND invoice_id=NEW.invoice_id;
 IF NEW.amount_minor>balance THEN RAISE EXCEPTION 'Allocation exceeds remaining balance' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
