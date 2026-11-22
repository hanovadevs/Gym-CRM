-- Adjacent availability windows form continuous real UTC coverage, including
-- gym-local midnight and daylight-saving boundaries. No extension is required.
CREATE FUNCTION gym.schedule_covered(p_org uuid,p_trainer uuid,p_branch uuid,p_start timestamptz,p_end timestamptz,p_omit uuid DEFAULT NULL,p_replacement jsonb DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,gym AS $$
 WITH org AS (SELECT time_zone zone FROM gym.organizations WHERE id=p_org),
 available AS (SELECT weekday,start_minute,end_minute FROM gym.trainer_availability WHERE organization_id=p_org AND trainer_id=p_trainer AND branch_id=p_branch AND active AND (p_omit IS NULL OR id<>p_omit)
 UNION ALL SELECT (p_replacement->>'weekday')::int,(p_replacement->>'startMinute')::int,(p_replacement->>'endMinute')::int WHERE coalesce((p_replacement->>'active')::boolean,false)),
 windows AS (SELECT (d.day+make_interval(mins=>a.start_minute)) at time zone o.zone begin_at,(d.day+make_interval(mins=>a.end_minute)) at time zone o.zone finish_at
 FROM org o CROSS JOIN LATERAL generate_series(((p_start at time zone o.zone)::date-1)::timestamp,((p_end at time zone o.zone)::date+1)::timestamp,interval '1 day') d(day) JOIN available a ON a.weekday=extract(dow FROM d.day))
 SELECT coalesce((SELECT range_agg(CASE WHEN finish_at>begin_at THEN tstzrange(begin_at,finish_at,'[)') ELSE 'empty'::tstzrange END) @> tstzrange(p_start,p_end,'[)') FROM windows),false)
$$;
REVOKE ALL ON FUNCTION gym.schedule_covered(uuid,uuid,uuid,timestamptz,timestamptz,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gym.schedule_covered(uuid,uuid,uuid,timestamptz,timestamptz,uuid,jsonb) TO gym_runtime;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION gym.guard_trainer_assignment() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
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
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM gym.personal_sessions p JOIN gym.schedule_slots s ON s.organization_id=p.organization_id AND s.id=p.slot_id WHERE p.organization_id=NEW.organization_id AND p.assignment_id=NEW.id AND s.cancelled_at IS NULL AND s.ends_at>clock_timestamp() AND (NOT NEW.active OR (s.starts_at at time zone zone)::date<NEW.start_on OR (NEW.end_on_exclusive IS NOT NULL AND ((s.ends_at-interval '1 microsecond') at time zone zone)::date>=NEW.end_on_exclusive))) THEN RAISE EXCEPTION 'Resolve upcoming sessions before ending an assignment' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION gym.guard_trainer_availability() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE zone text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-trainer:'||NEW.organization_id::text||':'||NEW.trainer_id::text,0));
 SELECT time_zone INTO zone FROM gym.organizations WHERE id=NEW.organization_id;
 IF TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR (NEW.organization_id,NEW.trainer_id,NEW.branch_id,NEW.weekday) IS DISTINCT FROM (OLD.organization_id,OLD.trainer_id,OLD.branch_id,OLD.weekday)) THEN RAISE EXCEPTION 'Invalid availability revision' USING ERRCODE='23514'; END IF;
 IF NEW.active AND EXISTS(SELECT 1 FROM gym.trainer_availability a WHERE a.organization_id=NEW.organization_id AND a.trainer_id=NEW.trainer_id AND a.branch_id=NEW.branch_id AND a.weekday=NEW.weekday AND a.active AND a.id<>NEW.id AND a.start_minute<NEW.end_minute AND a.end_minute>NEW.start_minute) THEN RAISE EXCEPTION 'Availability windows overlap' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM gym.schedule_slots s WHERE s.organization_id=NEW.organization_id AND s.trainer_id=NEW.trainer_id AND s.branch_id=NEW.branch_id AND s.cancelled_at IS NULL AND s.ends_at>clock_timestamp() AND NOT gym.schedule_covered(NEW.organization_id,NEW.trainer_id,NEW.branch_id,s.starts_at,s.ends_at,NEW.id,jsonb_build_object('weekday',NEW.weekday,'startMinute',NEW.start_minute,'endMinute',NEW.end_minute,'active',NEW.active))) THEN RAISE EXCEPTION 'Resolve upcoming sessions before changing availability' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION gym.guard_schedule_slot() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
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
 IF NOT EXISTS(SELECT 1 FROM gym.trainers t JOIN gym.trainer_branches b ON b.organization_id=t.organization_id AND b.trainer_id=t.id JOIN gym.branches branch ON branch.organization_id=b.organization_id AND branch.id=b.branch_id WHERE t.organization_id=NEW.organization_id AND t.id=NEW.trainer_id AND t.active AND b.branch_id=NEW.branch_id AND b.active AND branch.active) THEN RAISE EXCEPTION 'Active trainer and assigned branch required' USING ERRCODE='23514'; END IF;
 IF NOT gym.schedule_covered(NEW.organization_id,NEW.trainer_id,NEW.branch_id,NEW.starts_at,NEW.ends_at) THEN RAISE EXCEPTION 'Session falls outside trainer availability' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM gym.schedule_slots s WHERE s.organization_id=NEW.organization_id AND s.trainer_id=NEW.trainer_id AND s.id<>NEW.id AND s.cancelled_at IS NULL AND s.starts_at<NEW.ends_at AND s.ends_at>NEW.starts_at) THEN RAISE EXCEPTION 'Trainer is already scheduled' USING ERRCODE='23514'; END IF;
 IF NEW.room_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM gym.schedule_rooms WHERE organization_id=NEW.organization_id AND id=NEW.room_id AND branch_id=NEW.branch_id AND active) THEN RAISE EXCEPTION 'Active room required' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM gym.schedule_slots s WHERE s.organization_id=NEW.organization_id AND s.room_id=NEW.room_id AND s.id<>NEW.id AND s.cancelled_at IS NULL AND s.starts_at<NEW.ends_at AND s.ends_at>NEW.starts_at) THEN RAISE EXCEPTION 'Room is already scheduled' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT member_id INTO participant FROM gym.personal_sessions WHERE organization_id=NEW.organization_id AND slot_id=NEW.id;
 IF participant IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-member:'||NEW.organization_id::text||':'||participant::text,0));
  IF EXISTS(SELECT 1 FROM gym.personal_sessions p JOIN gym.trainer_assignments a ON a.organization_id=p.organization_id AND a.id=p.assignment_id WHERE p.organization_id=NEW.organization_id AND p.slot_id=NEW.id AND (NOT a.active OR a.start_on>local_start::date OR (a.end_on_exclusive IS NOT NULL AND a.end_on_exclusive<=((NEW.ends_at-interval '1 microsecond') at time zone zone)::date))) THEN RAISE EXCEPTION 'Assignment does not cover session date' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM gym.personal_sessions p JOIN gym.schedule_slots s ON s.organization_id=p.organization_id AND s.id=p.slot_id WHERE p.organization_id=NEW.organization_id AND p.member_id=participant AND p.slot_id<>NEW.id AND s.cancelled_at IS NULL AND s.starts_at<NEW.ends_at AND s.ends_at>NEW.starts_at) THEN RAISE EXCEPTION 'Member is already in a personal session' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION gym.guard_personal_session() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
DECLARE slot gym.schedule_slots; session_day date; last_day date;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-trainer:'||NEW.organization_id::text||':'||NEW.trainer_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-member:'||NEW.organization_id::text||':'||NEW.member_id::text,0));
 SELECT * INTO slot FROM gym.schedule_slots WHERE organization_id=NEW.organization_id AND id=NEW.slot_id;
 SELECT (slot.starts_at at time zone time_zone)::date,((slot.ends_at-interval '1 microsecond') at time zone time_zone)::date INTO session_day,last_day FROM gym.organizations WHERE id=NEW.organization_id;
 IF slot.id IS NULL OR slot.kind<>'pt' OR NOT EXISTS(SELECT 1 FROM gym.trainer_assignments WHERE organization_id=NEW.organization_id AND id=NEW.assignment_id AND trainer_id=NEW.trainer_id AND branch_id=NEW.branch_id AND member_id=NEW.member_id AND active AND start_on<=session_day AND (end_on_exclusive IS NULL OR end_on_exclusive>last_day)) OR NOT EXISTS(SELECT 1 FROM gym.members WHERE organization_id=NEW.organization_id AND id=NEW.member_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Personal session needs an effective member assignment' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM gym.personal_sessions p JOIN gym.schedule_slots s ON s.organization_id=p.organization_id AND s.id=p.slot_id WHERE p.organization_id=NEW.organization_id AND p.member_id=NEW.member_id AND s.cancelled_at IS NULL AND s.starts_at<slot.ends_at AND s.ends_at>slot.starts_at) THEN RAISE EXCEPTION 'Member is already in a personal session' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
