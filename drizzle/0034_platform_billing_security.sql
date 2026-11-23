-- Platform fees are separate from all gym-member invoices and receipts.
CREATE VIEW platform.billing_balances WITH(security_invoker=true) AS
SELECT c.*, (coalesce(p.paid,0)-coalesce(r.reversed,0))::numeric net_paid_minor,
 CASE WHEN c.voided_at IS NOT NULL THEN 0 ELSE c.amount_minor-coalesce(p.paid,0)+coalesce(r.reversed,0) END::numeric balance_minor
FROM platform.billing_charges c
LEFT JOIN LATERAL(SELECT sum(amount_minor)::numeric paid FROM platform.billing_payments p WHERE p.organization_id=c.organization_id AND p.charge_id=c.id)p ON true
LEFT JOIN LATERAL(SELECT sum(amount_minor)::numeric reversed FROM platform.billing_reversals r WHERE r.organization_id=c.organization_id AND r.charge_id=c.id)r ON true;
REVOKE ALL ON platform.billing_balances FROM PUBLIC;
GRANT SELECT ON platform.billing_balances TO gym_runtime;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['billing_charges','billing_payments','billing_reversals','billing_requests'] LOOP
  EXECUTE format('ALTER TABLE platform.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON platform.%I FROM PUBLIC,gym_runtime',t);
  EXECUTE format('GRANT SELECT ON platform.%I TO gym_runtime',t);
  EXECUTE format('CREATE POLICY platform_fee_read ON platform.%I FOR SELECT TO gym_runtime USING(platform.authorize(nullif(current_setting(''app.platform_user_id'',true),'''')))',t);
  EXECUTE format('CREATE POLICY platform_fee_insert ON platform.%I FOR INSERT TO gym_runtime WITH CHECK(platform.authorize(nullif(current_setting(''app.platform_user_id'',true),'''')) AND %I=nullif(current_setting(''app.platform_user_id'',true),''''))',t,CASE WHEN t='billing_requests' THEN 'actor_id' ELSE 'created_by' END);
 END LOOP;
END $$;
GRANT INSERT(organization_id,billing_month,due_on,amount_minor,currency,created_by) ON platform.billing_charges TO gym_runtime;
GRANT INSERT(organization_id,charge_id,amount_minor,currency,paid_on,method,reference,note,created_by) ON platform.billing_payments TO gym_runtime;
GRANT INSERT(organization_id,payment_id,charge_id,amount_minor,currency,cash_on,reason,created_by) ON platform.billing_reversals TO gym_runtime;
GRANT INSERT(organization_id,actor_id,request_key,request_hash,operation,reason,result) ON platform.billing_requests TO gym_runtime;
GRANT UPDATE(voided_at,voided_by,void_reason) ON platform.billing_charges TO gym_runtime;
CREATE POLICY platform_fee_void ON platform.billing_charges FOR UPDATE TO gym_runtime
USING(platform.authorize(nullif(current_setting('app.platform_user_id',true),'')))
WITH CHECK(platform.authorize(nullif(current_setting('app.platform_user_id',true),'')) AND voided_by=nullif(current_setting('app.platform_user_id',true),''));
--> statement-breakpoint
CREATE FUNCTION platform.guard_billing() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor text; today date; charge platform.billing_charges%ROWTYPE; payment platform.billing_payments%ROWTYPE; paid numeric; reversed numeric;
BEGIN
 actor:=nullif(current_setting('app.platform_user_id',true),'');
 IF NOT coalesce(platform.authorize(actor),false) THEN RAISE EXCEPTION 'Platform billing access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-billing:'||NEW.organization_id::text,0));
 SELECT (clock_timestamp() AT TIME ZONE o.time_zone)::date INTO today FROM gym.organizations o WHERE o.id=NEW.organization_id;
 IF today IS NULL THEN RAISE EXCEPTION 'Gym unavailable' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.created_by<>actor THEN RAISE EXCEPTION 'Invalid billing actor' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='billing_charges' THEN
  IF TG_OP='INSERT' THEN
   IF NEW.voided_at IS NOT NULL OR NEW.voided_by IS NOT NULL OR NEW.void_reason<>'' OR NEW.billing_month>(date_trunc('month',today)+interval '12 months')::date THEN RAISE EXCEPTION 'Invalid monthly charge' USING ERRCODE='23514'; END IF;
  ELSE
   IF OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL OR NEW.voided_by<>actor OR NEW.voided_at>clock_timestamp() OR (to_jsonb(NEW)-ARRAY['voided_at','voided_by','void_reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['voided_at','voided_by','void_reason']) THEN RAISE EXCEPTION 'Charge history is immutable' USING ERRCODE='23514'; END IF;
   SELECT coalesce(sum(amount_minor),0) INTO paid FROM platform.billing_payments WHERE organization_id=NEW.organization_id AND charge_id=NEW.id;
   SELECT coalesce(sum(amount_minor),0) INTO reversed FROM platform.billing_reversals WHERE organization_id=NEW.organization_id AND charge_id=NEW.id;
   IF paid<>reversed THEN RAISE EXCEPTION 'Reverse retained payments before voiding' USING ERRCODE='23514'; END IF;
   NEW.voided_at:=clock_timestamp();
  END IF;
 ELSIF TG_TABLE_NAME='billing_payments' THEN
  SELECT * INTO charge FROM platform.billing_charges WHERE organization_id=NEW.organization_id AND id=NEW.charge_id;
  IF charge.id IS NULL OR charge.voided_at IS NOT NULL OR NEW.paid_on>today THEN RAISE EXCEPTION 'Monthly charge is unavailable or payment is future-dated' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(amount_minor),0) INTO paid FROM platform.billing_payments WHERE organization_id=NEW.organization_id AND charge_id=NEW.charge_id;
  SELECT coalesce(sum(amount_minor),0) INTO reversed FROM platform.billing_reversals WHERE organization_id=NEW.organization_id AND charge_id=NEW.charge_id;
  IF NEW.amount_minor>charge.amount_minor-paid+reversed THEN RAISE EXCEPTION 'Payment exceeds remaining fee' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO payment FROM platform.billing_payments WHERE organization_id=NEW.organization_id AND id=NEW.payment_id;
  IF payment.id IS NULL OR NEW.cash_on<payment.paid_on OR NEW.cash_on>today THEN RAISE EXCEPTION 'Invalid reversal cash date' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform.guard_billing() FROM PUBLIC,gym_runtime;
CREATE TRIGGER guard_platform_charge BEFORE INSERT OR UPDATE ON platform.billing_charges FOR EACH ROW EXECUTE FUNCTION platform.guard_billing();
CREATE TRIGGER guard_platform_payment BEFORE INSERT ON platform.billing_payments FOR EACH ROW EXECUTE FUNCTION platform.guard_billing();
CREATE TRIGGER guard_platform_reversal BEFORE INSERT ON platform.billing_reversals FOR EACH ROW EXECUTE FUNCTION platform.guard_billing();
--> statement-breakpoint
CREATE FUNCTION platform.billing_summary(p_user_id text,p_organization_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT platform.authorize(p_user_id) THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('month',date_trunc('month',today)::date::text,'status',CASE WHEN c.id IS NULL THEN 'not_recorded' WHEN c.balance_minor=0 THEN 'paid' WHEN c.due_on<today THEN 'overdue' WHEN c.net_paid_minor>0 THEN 'partial' ELSE 'unpaid' END,'chargeId',c.id,'amountMinor',c.amount_minor::text,'balanceMinor',c.balance_minor::text,'currency',c.currency,'dueOn',c.due_on::text,
 'outstanding',coalesce((SELECT jsonb_agg(d) FROM(SELECT currency,sum(balance_minor)::text AS "amountMinor" FROM platform.billing_balances WHERE organization_id=o.id AND voided_at IS NULL AND balance_minor>0 GROUP BY currency ORDER BY currency)d),'[]'::jsonb)) INTO result
 FROM gym.organizations o CROSS JOIN LATERAL(SELECT (statement_timestamp() AT TIME ZONE o.time_zone)::date today)cal
 LEFT JOIN platform.billing_balances c ON c.organization_id=o.id AND c.billing_month=date_trunc('month',today)::date AND c.voided_at IS NULL WHERE o.id=p_organization_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION platform.billing_summary(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.billing_summary(text,uuid) TO gym_runtime;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION platform.directory(p_user_id text,p_search text,p_page integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT platform.authorize(p_user_id) THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('total',(SELECT count(*) FROM gym.organizations o WHERE strpos(lower(o.name||' '||o.slug),lower(p_search))>0),'gyms',coalesce(jsonb_agg(item ORDER BY name,id),'[]'::jsonb)) INTO result
 FROM(SELECT o.id,o.name,jsonb_build_object('id',o.id,'name',o.name,'slug',o.slug,'active',o.active,'version',o.settings_version,'email',o.email,'phone',o.phone,'address',o.address,'createdAt',o.created_at,
 'members',(SELECT count(*) FROM gym.members m WHERE m.organization_id=o.id AND m.archived_at IS NULL),'staff',(SELECT count(*) FROM gym.staff_memberships s WHERE s.organization_id=o.id AND s.active),'branches',(SELECT count(*) FROM gym.branches b WHERE b.organization_id=o.id AND b.active),'billing',platform.billing_summary(p_user_id,o.id)) item
 FROM gym.organizations o WHERE strpos(lower(o.name||' '||o.slug),lower(p_search))>0 ORDER BY o.name,o.id LIMIT 15 OFFSET(greatest(1,least(p_page,10000))-1)*15)q;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION platform.directory(text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.directory(text,text,integer) TO gym_runtime;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION platform.activity(p_user_id text,p_organization_id uuid,p_page integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF p_user_id IS NULL OR NOT platform.authorize(p_user_id) THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 WITH events AS(
 SELECT a.id,a.organization_id,a.actor_user_id,a.action,a.reason,a.occurred_at,'gym' source FROM gym.audit_events a WHERE p_organization_id IS NULL OR a.organization_id=p_organization_id
 UNION ALL SELECT a.id,a.organization_id,a.actor_user_id,a.action,a.reason,a.occurred_at,'platform' FROM platform.events a WHERE p_organization_id IS NULL OR a.organization_id=p_organization_id
 UNION ALL SELECT a.id,a.organization_id,a.actor_id,'billing.'||a.operation,a.reason,a.created_at,'platform billing' FROM platform.billing_requests a WHERE p_organization_id IS NULL OR a.organization_id=p_organization_id
 ),selected AS(SELECT * FROM events ORDER BY occurred_at DESC,id DESC LIMIT 20 OFFSET(greatest(1,least(p_page,10000))-1)*20)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM events),'events',coalesce(jsonb_agg(jsonb_build_object('id',e.id,'organizationId',e.organization_id,'gymName',o.name,'actor',u.name,'action',e.action,'reason',e.reason,'occurredAt',e.occurred_at,'source',e.source) ORDER BY e.occurred_at DESC,e.id DESC),'[]'::jsonb)) INTO result
 FROM selected e JOIN gym.organizations o ON o.id=e.organization_id JOIN app_auth."user" u ON u.id=e.actor_user_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION platform.activity(text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.activity(text,uuid,integer) TO gym_runtime;
