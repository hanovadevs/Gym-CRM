-- Custom SQL migration file, put your code below! --
GRANT SELECT,INSERT ON gym.trainers,gym.trainer_branches,gym.trainer_assignments,gym.trainer_availability,gym.schedule_rooms,gym.schedule_slots,gym.personal_sessions,gym.schedule_requests TO gym_runtime;
GRANT UPDATE(name,specialties,phone,email,login_user_id,active,version,updated_by,updated_at) ON gym.trainers TO gym_runtime;
GRANT UPDATE(active,version,updated_by,updated_at) ON gym.trainer_branches TO gym_runtime;
GRANT UPDATE(start_on,end_on_exclusive,active,version,updated_by,updated_at) ON gym.trainer_assignments TO gym_runtime;
GRANT UPDATE(start_minute,end_minute,active,version,updated_by,updated_at) ON gym.trainer_availability TO gym_runtime;
GRANT UPDATE(name,normalized_name,capacity,active,version,updated_by,updated_at) ON gym.schedule_rooms TO gym_runtime;
GRANT UPDATE(title,room_id,starts_at,ends_at,cancelled_at,cancelled_by,cancellation_reason,version,updated_by,updated_at) ON gym.schedule_slots TO gym_runtime;
--> statement-breakpoint
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['trainers','trainer_branches','trainer_assignments','trainer_availability','schedule_rooms','schedule_slots','personal_sessions','schedule_requests'] LOOP
  EXECUTE format('ALTER TABLE gym.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY tenant_scope ON gym.%I TO gym_runtime USING(organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK(organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION gym.guard_trainer_resource() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE trainer_key uuid; linked_user text;
BEGIN
 IF TG_TABLE_NAME='trainers' THEN trainer_key:=NEW.id; ELSE trainer_key:=NEW.trainer_id; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-trainer:'||NEW.organization_id::text||':'||trainer_key::text,0));
 IF TG_OP='UPDATE' AND NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Invalid trainer revision' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='trainers' THEN
  IF NOT NEW.active AND EXISTS(SELECT 1 FROM gym.schedule_slots WHERE organization_id=NEW.organization_id AND trainer_id=NEW.id AND cancelled_at IS NULL AND ends_at>clock_timestamp()) THEN RAISE EXCEPTION 'Resolve upcoming trainer sessions before deactivation' USING ERRCODE='23514'; END IF;
  linked_user:=NEW.login_user_id;
 ELSE
  IF NOT NEW.active AND EXISTS(SELECT 1 FROM gym.schedule_slots WHERE organization_id=NEW.organization_id AND trainer_id=NEW.trainer_id AND branch_id=NEW.branch_id AND cancelled_at IS NULL AND ends_at>clock_timestamp()) THEN RAISE EXCEPTION 'Resolve upcoming branch sessions before removing trainer access' USING ERRCODE='23514'; END IF;
  SELECT login_user_id INTO linked_user FROM gym.trainers WHERE organization_id=NEW.organization_id AND id=NEW.trainer_id;
 END IF;
 IF linked_user IS NOT NULL THEN
  PERFORM id FROM gym.staff_memberships WHERE organization_id=NEW.organization_id AND auth_user_id=linked_user AND active AND role='trainer' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link an active trainer staff identity in this gym' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='trainer_branches' THEN
   IF NEW.active AND NOT EXISTS(SELECT 1 FROM gym.staff_memberships s JOIN gym.staff_branch_grants g ON g.organization_id=s.organization_id AND g.staff_membership_id=s.id WHERE s.organization_id=NEW.organization_id AND s.auth_user_id=linked_user AND g.branch_id=NEW.branch_id) THEN RAISE EXCEPTION 'Trainer login needs this branch grant' USING ERRCODE='23514'; END IF;
  ELSE
   IF EXISTS(SELECT 1 FROM gym.trainer_branches b WHERE b.organization_id=NEW.organization_id AND b.trainer_id=NEW.id AND b.active AND NOT EXISTS(SELECT 1 FROM gym.staff_memberships s JOIN gym.staff_branch_grants g ON g.organization_id=s.organization_id AND g.staff_membership_id=s.id WHERE s.organization_id=NEW.organization_id AND s.auth_user_id=linked_user AND g.branch_id=b.branch_id)) THEN RAISE EXCEPTION 'Trainer login lacks an assigned branch' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trainer_resource_guard BEFORE INSERT OR UPDATE ON gym.trainers FOR EACH ROW EXECUTE FUNCTION gym.guard_trainer_resource();
CREATE TRIGGER trainer_branch_resource_guard BEFORE INSERT OR UPDATE ON gym.trainer_branches FOR EACH ROW EXECUTE FUNCTION gym.guard_trainer_resource();
--> statement-breakpoint
CREATE FUNCTION gym.guard_trainer_assignment() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE zone text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-trainer:'||NEW.organization_id::text||':'||NEW.trainer_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-member:'||NEW.organization_id::text||':'||NEW.member_id::text,0));
 SELECT time_zone INTO zone FROM gym.organizations WHERE id=NEW.organization_id;
 IF TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR (NEW.organization_id,NEW.trainer_id,NEW.member_id,NEW.branch_id) IS DISTINCT FROM (OLD.organization_id,OLD.trainer_id,OLD.member_id,OLD.branch_id)) THEN RAISE EXCEPTION 'Invalid assignment revision' USING ERRCODE='23514'; END IF;
 IF NEW.active THEN
  IF NOT EXISTS(SELECT 1 FROM gym.trainers t JOIN gym.trainer_branches b ON b.organization_id=t.organization_id AND b.trainer_id=t.id WHERE t.organization_id=NEW.organization_id AND t.id=NEW.trainer_id AND t.active AND b.branch_id=NEW.branch_id AND b.active) OR NOT EXISTS(SELECT 1 FROM gym.members WHERE organization_id=NEW.organization_id AND id=NEW.member_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Active trainer and member required' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM gym.trainer_assignments a WHERE a.organization_id=NEW.organization_id AND a.trainer_id=NEW.trainer_id AND a.member_id=NEW.member_id AND a.branch_id=NEW.branch_id AND a.id<>NEW.id AND a.active AND a.start_on<coalesce(NEW.end_on_exclusive,'infinity'::date) AND coalesce(a.end_on_exclusive,'infinity'::date)>NEW.start_on) THEN RAISE EXCEPTION 'Trainer assignment overlaps' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM gym.personal_sessions p JOIN gym.schedule_slots s ON s.organization_id=p.organization_id AND s.id=p.slot_id WHERE p.organization_id=NEW.organization_id AND p.assignment_id=NEW.id AND s.cancelled_at IS NULL AND s.ends_at>clock_timestamp() AND (NOT NEW.active OR (s.starts_at at time zone zone)::date<NEW.start_on OR (NEW.end_on_exclusive IS NOT NULL AND (s.starts_at at time zone zone)::date>=NEW.end_on_exclusive))) THEN RAISE EXCEPTION 'Resolve upcoming sessions before ending an assignment' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trainer_assignment_guard BEFORE INSERT OR UPDATE ON gym.trainer_assignments FOR EACH ROW EXECUTE FUNCTION gym.guard_trainer_assignment();
--> statement-breakpoint
CREATE FUNCTION gym.guard_trainer_availability() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE zone text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-trainer:'||NEW.organization_id::text||':'||NEW.trainer_id::text,0));
 SELECT time_zone INTO zone FROM gym.organizations WHERE id=NEW.organization_id;
 IF TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR (NEW.organization_id,NEW.trainer_id,NEW.branch_id,NEW.weekday) IS DISTINCT FROM (OLD.organization_id,OLD.trainer_id,OLD.branch_id,OLD.weekday)) THEN RAISE EXCEPTION 'Invalid availability revision' USING ERRCODE='23514'; END IF;
 IF NEW.active AND EXISTS(SELECT 1 FROM gym.trainer_availability a WHERE a.organization_id=NEW.organization_id AND a.trainer_id=NEW.trainer_id AND a.branch_id=NEW.branch_id AND a.weekday=NEW.weekday AND a.active AND a.id<>NEW.id AND a.start_minute<NEW.end_minute AND a.end_minute>NEW.start_minute) THEN RAISE EXCEPTION 'Availability windows overlap' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM gym.schedule_slots s WHERE s.organization_id=NEW.organization_id AND s.trainer_id=NEW.trainer_id AND s.branch_id=NEW.branch_id AND s.cancelled_at IS NULL AND s.ends_at>clock_timestamp() AND extract(dow FROM s.starts_at at time zone zone)=NEW.weekday AND extract(epoch FROM (s.starts_at at time zone zone)::time)/60>=OLD.start_minute AND extract(epoch FROM (s.ends_at at time zone zone)::time)/60<=OLD.end_minute AND (NOT NEW.active OR extract(epoch FROM (s.starts_at at time zone zone)::time)/60<NEW.start_minute OR extract(epoch FROM (s.ends_at at time zone zone)::time)/60>NEW.end_minute)) THEN RAISE EXCEPTION 'Resolve upcoming sessions before changing availability' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trainer_availability_guard BEFORE INSERT OR UPDATE ON gym.trainer_availability FOR EACH ROW EXECUTE FUNCTION gym.guard_trainer_availability();
--> statement-breakpoint
CREATE FUNCTION gym.guard_schedule_room() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-room:'||NEW.organization_id::text||':'||NEW.id::text,0));
 IF TG_OP='UPDATE' AND NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Invalid room revision' USING ERRCODE='23514'; END IF;
 IF NOT NEW.active AND EXISTS(SELECT 1 FROM gym.schedule_slots WHERE organization_id=NEW.organization_id AND room_id=NEW.id AND cancelled_at IS NULL AND ends_at>clock_timestamp()) THEN RAISE EXCEPTION 'Resolve upcoming room sessions before deactivation' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER schedule_room_guard BEFORE INSERT OR UPDATE ON gym.schedule_rooms FOR EACH ROW EXECUTE FUNCTION gym.guard_schedule_room();
--> statement-breakpoint
CREATE FUNCTION gym.guard_schedule_slot() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE zone text; old_room uuid; room_key uuid; participant uuid; local_start timestamp; local_end timestamp;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.cancelled_at IS NOT NULL OR OLD.starts_at<=clock_timestamp() OR NEW.version<>OLD.version+1 OR (NEW.organization_id,NEW.id,NEW.branch_id,NEW.trainer_id,NEW.kind,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.organization_id,OLD.id,OLD.branch_id,OLD.trainer_id,OLD.kind,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Only upcoming sessions can be changed' USING ERRCODE='23514'; END IF;
  old_room:=OLD.room_id;
 ELSIF NEW.cancelled_at IS NOT NULL OR NEW.version<>1 THEN RAISE EXCEPTION 'New sessions must be scheduled' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-trainer:'||NEW.organization_id::text||':'||NEW.trainer_id::text,0));
 FOR room_key IN SELECT DISTINCT resource FROM unnest(ARRAY[old_room,NEW.room_id]) resource WHERE resource IS NOT NULL ORDER BY resource LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-room:'||NEW.organization_id::text||':'||room_key::text,0));
 END LOOP;
 IF NEW.cancelled_at IS NOT NULL THEN RETURN NEW; END IF;
 SELECT time_zone INTO zone FROM gym.organizations WHERE id=NEW.organization_id;
 local_start:=NEW.starts_at at time zone zone;local_end:=NEW.ends_at at time zone zone;
 IF current_user='gym_runtime' AND NEW.starts_at<=clock_timestamp() THEN RAISE EXCEPTION 'Schedule future sessions' USING ERRCODE='23514'; END IF;
 IF local_start::date<>local_end::date THEN RAISE EXCEPTION 'Session must fit one gym-local day' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM gym.trainers t JOIN gym.trainer_branches b ON b.organization_id=t.organization_id AND b.trainer_id=t.id JOIN gym.branches branch ON branch.organization_id=b.organization_id AND branch.id=b.branch_id WHERE t.organization_id=NEW.organization_id AND t.id=NEW.trainer_id AND t.active AND b.branch_id=NEW.branch_id AND b.active AND branch.active) THEN RAISE EXCEPTION 'Active trainer and assigned branch required' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM gym.trainer_availability a WHERE a.organization_id=NEW.organization_id AND a.trainer_id=NEW.trainer_id AND a.branch_id=NEW.branch_id AND a.active AND a.weekday=extract(dow FROM local_start) AND a.start_minute<=extract(epoch FROM local_start::time)/60 AND a.end_minute>=extract(epoch FROM local_end::time)/60) THEN RAISE EXCEPTION 'Session falls outside trainer availability' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM gym.schedule_slots s WHERE s.organization_id=NEW.organization_id AND s.trainer_id=NEW.trainer_id AND s.id<>NEW.id AND s.cancelled_at IS NULL AND s.starts_at<NEW.ends_at AND s.ends_at>NEW.starts_at) THEN RAISE EXCEPTION 'Trainer is already scheduled' USING ERRCODE='23514'; END IF;
 IF NEW.room_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM gym.schedule_rooms WHERE organization_id=NEW.organization_id AND id=NEW.room_id AND branch_id=NEW.branch_id AND active) THEN RAISE EXCEPTION 'Active room required' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM gym.schedule_slots s WHERE s.organization_id=NEW.organization_id AND s.room_id=NEW.room_id AND s.id<>NEW.id AND s.cancelled_at IS NULL AND s.starts_at<NEW.ends_at AND s.ends_at>NEW.starts_at) THEN RAISE EXCEPTION 'Room is already scheduled' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT member_id INTO participant FROM gym.personal_sessions WHERE organization_id=NEW.organization_id AND slot_id=NEW.id;
 IF participant IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-member:'||NEW.organization_id::text||':'||participant::text,0));
  IF EXISTS(SELECT 1 FROM gym.personal_sessions p JOIN gym.trainer_assignments a ON a.organization_id=p.organization_id AND a.id=p.assignment_id WHERE p.organization_id=NEW.organization_id AND p.slot_id=NEW.id AND (NOT a.active OR a.start_on>local_start::date OR (a.end_on_exclusive IS NOT NULL AND a.end_on_exclusive<=local_start::date))) THEN RAISE EXCEPTION 'Assignment does not cover session date' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM gym.personal_sessions p JOIN gym.schedule_slots s ON s.organization_id=p.organization_id AND s.id=p.slot_id WHERE p.organization_id=NEW.organization_id AND p.member_id=participant AND p.slot_id<>NEW.id AND s.cancelled_at IS NULL AND s.starts_at<NEW.ends_at AND s.ends_at>NEW.starts_at) THEN RAISE EXCEPTION 'Member is already in a personal session' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER schedule_slot_guard BEFORE INSERT OR UPDATE ON gym.schedule_slots FOR EACH ROW EXECUTE FUNCTION gym.guard_schedule_slot();
--> statement-breakpoint
CREATE FUNCTION gym.guard_personal_session() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE slot gym.schedule_slots; session_day date;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-trainer:'||NEW.organization_id::text||':'||NEW.trainer_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-member:'||NEW.organization_id::text||':'||NEW.member_id::text,0));
 SELECT * INTO slot FROM gym.schedule_slots WHERE organization_id=NEW.organization_id AND id=NEW.slot_id;
 SELECT (slot.starts_at at time zone time_zone)::date INTO session_day FROM gym.organizations WHERE id=NEW.organization_id;
 IF slot.id IS NULL OR slot.kind<>'pt' OR NOT EXISTS(SELECT 1 FROM gym.trainer_assignments WHERE organization_id=NEW.organization_id AND id=NEW.assignment_id AND trainer_id=NEW.trainer_id AND branch_id=NEW.branch_id AND member_id=NEW.member_id AND active AND start_on<=session_day AND (end_on_exclusive IS NULL OR end_on_exclusive>session_day)) OR NOT EXISTS(SELECT 1 FROM gym.members WHERE organization_id=NEW.organization_id AND id=NEW.member_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Personal session needs an effective member assignment' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM gym.personal_sessions p JOIN gym.schedule_slots s ON s.organization_id=p.organization_id AND s.id=p.slot_id WHERE p.organization_id=NEW.organization_id AND p.member_id=NEW.member_id AND s.cancelled_at IS NULL AND s.starts_at<slot.ends_at AND s.ends_at>slot.starts_at) THEN RAISE EXCEPTION 'Member is already in a personal session' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER personal_session_guard BEFORE INSERT ON gym.personal_sessions FOR EACH ROW EXECUTE FUNCTION gym.guard_personal_session();
--> statement-breakpoint
CREATE FUNCTION gym.check_personal_slot_link() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
BEGIN
 IF NEW.kind='pt' AND NOT EXISTS(SELECT 1 FROM gym.personal_sessions WHERE organization_id=NEW.organization_id AND slot_id=NEW.id) THEN RAISE EXCEPTION 'Personal slot must have a linked member' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER personal_slot_link_guard AFTER INSERT OR UPDATE ON gym.schedule_slots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION gym.check_personal_slot_link();
REVOKE ALL ON FUNCTION gym.guard_trainer_resource(),gym.guard_trainer_assignment(),gym.guard_trainer_availability(),gym.guard_schedule_room(),gym.guard_schedule_slot(),gym.guard_personal_session(),gym.check_personal_slot_link() FROM PUBLIC;
