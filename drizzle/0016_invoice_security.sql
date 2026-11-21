-- Custom SQL migration file, put your code below! --
-- Preserve existing issued enrollment charges and add their explicit line snapshot.
UPDATE gym.invoices i SET recipient_name=m.name,recipient_code=m.member_code,branch_name=b.name,
 issuer_snapshot=jsonb_build_object('name',o.name,'address',o.address,'email',o.email,'phone',o.phone,'footer',o.receipt_footer,'locale',o.locale)
 FROM gym.members m,gym.branches b,gym.organizations o
 WHERE m.organization_id=i.organization_id AND m.id=i.member_id AND b.organization_id=i.organization_id AND b.id=i.originating_branch_id AND o.id=i.organization_id;
INSERT INTO gym.invoice_items(organization_id,invoice_id,revision,position,description,quantity,unit_minor,discount_minor,total_minor)
 SELECT organization_id,id,1,1,description,1,total_minor,0,total_minor FROM gym.invoices;

ALTER TABLE gym.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.billing_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_items_tenant ON gym.invoice_items TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY billing_requests_tenant ON gym.billing_requests TO gym_runtime USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT ON gym.invoice_items,gym.billing_requests TO gym_runtime;
GRANT UPDATE(description,total_minor,due_on,status,number,issued_on,version,line_revision) ON gym.invoices TO gym_runtime;

-- Freeze issued headers. Draft revisions retain immutable earlier line sets.
CREATE FUNCTION gym.guard_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.status='issued' THEN RAISE EXCEPTION 'Issued invoice is immutable' USING ERRCODE='23514'; END IF;
  IF (NEW.id,NEW.organization_id,NEW.member_id,NEW.originating_branch_id,NEW.membership_id,NEW.currency,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.member_id,OLD.originating_branch_id,OLD.membership_id,OLD.currency,OLD.created_by,OLD.created_at)
   OR NEW.version<>OLD.version+1 OR (NEW.status='draft' AND NEW.line_revision<>OLD.line_revision+1) OR (NEW.status='issued' AND NEW.line_revision<>OLD.line_revision) THEN
   RAISE EXCEPTION 'Invalid invoice revision or identity' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.version<>1 OR NEW.line_revision<>1 OR (NEW.status='issued' AND NEW.membership_id IS NULL) THEN
  RAISE EXCEPTION 'New manual invoices must begin as drafts' USING ERRCODE='23514';
 END IF;
 SELECT m.name,m.member_code,b.name,jsonb_build_object('name',o.name,'address',o.address,'email',o.email,'phone',o.phone,'footer',o.receipt_footer,'locale',o.locale)
 INTO NEW.recipient_name,NEW.recipient_code,NEW.branch_name,NEW.issuer_snapshot
 FROM gym.members m JOIN gym.branches b ON b.organization_id=m.organization_id AND b.id=NEW.originating_branch_id JOIN gym.organizations o ON o.id=m.organization_id
 WHERE m.organization_id=NEW.organization_id AND m.id=NEW.member_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invoice recipient not found' USING ERRCODE='23503'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invoice_guard BEFORE INSERT OR UPDATE ON gym.invoices FOR EACH ROW EXECUTE FUNCTION gym.guard_invoice();

CREATE FUNCTION gym.guard_invoice_item() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE parent gym.invoices;
BEGIN
 SELECT * INTO parent FROM gym.invoices WHERE organization_id=NEW.organization_id AND id=NEW.invoice_id FOR UPDATE;
 IF NOT FOUND OR NEW.revision<>parent.line_revision THEN RAISE EXCEPTION 'Invalid invoice line revision' USING ERRCODE='23514'; END IF;
 IF parent.status='issued' AND NOT (parent.membership_id IS NOT NULL AND NEW.position=1 AND NEW.revision=1 AND NEW.description=parent.description AND NEW.quantity=1 AND NEW.unit_minor=parent.total_minor AND NEW.discount_minor=0 AND NEW.total_minor=parent.total_minor) THEN
  RAISE EXCEPTION 'Issued invoice lines are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invoice_item_guard BEFORE INSERT ON gym.invoice_items FOR EACH ROW EXECUTE FUNCTION gym.guard_invoice_item();

CREATE FUNCTION gym.enrollment_invoice_item() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
BEGIN
 IF NEW.membership_id IS NOT NULL THEN
  INSERT INTO gym.invoice_items(organization_id,invoice_id,revision,position,description,quantity,unit_minor,discount_minor,total_minor)
   VALUES(NEW.organization_id,NEW.id,1,1,NEW.description,1,NEW.total_minor,0,NEW.total_minor);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enrollment_invoice_item AFTER INSERT ON gym.invoices FOR EACH ROW EXECUTE FUNCTION gym.enrollment_invoice_item();

-- Deferred aggregate check permits an atomic header/revision/line transaction,
-- while independently rejecting incomplete or mismatched invoices at commit.
CREATE FUNCTION gym.check_invoice_total() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE parent gym.invoices; invoice_key uuid; line_count int; line_total numeric; gross numeric;
BEGIN
 IF TG_TABLE_NAME='invoices' THEN invoice_key:=NEW.id; ELSE invoice_key:=NEW.invoice_id; END IF;
 SELECT * INTO parent FROM gym.invoices WHERE organization_id=NEW.organization_id AND id=invoice_key FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT count(*),coalesce(sum(total_minor),0),coalesce(sum(quantity::numeric*unit_minor),0) INTO line_count,line_total,gross
 FROM gym.invoice_items WHERE organization_id=parent.organization_id AND invoice_id=parent.id AND revision=parent.line_revision;
 IF line_count NOT BETWEEN 1 AND 30 OR line_total<>parent.total_minor OR gross>999999999999 THEN
  RAISE EXCEPTION 'Invoice total does not match its lines' USING ERRCODE='23514',CONSTRAINT='invoice_line_total';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoice_total_guard AFTER INSERT OR UPDATE ON gym.invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION gym.check_invoice_total();
CREATE CONSTRAINT TRIGGER invoice_item_total_guard AFTER INSERT ON gym.invoice_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION gym.check_invoice_total();
REVOKE ALL ON FUNCTION gym.guard_invoice(),gym.guard_invoice_item(),gym.enrollment_invoice_item(),gym.check_invoice_total() FROM PUBLIC;

-- PAY-02/03 will extend this shared read contract with allocations/credits/refunds.
-- Drafts are not debts; a zero-charge invoice is not evidence of a payment.
CREATE VIEW gym.invoice_balances WITH(security_invoker=true) AS SELECT organization_id,id AS invoice_id,currency,
 CASE WHEN status='issued' THEN total_minor ELSE 0::bigint END AS balance_minor FROM gym.invoices;
GRANT SELECT ON gym.invoice_balances TO gym_runtime;
