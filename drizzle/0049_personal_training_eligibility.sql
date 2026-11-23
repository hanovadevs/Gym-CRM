CREATE FUNCTION gym.pt_member_eligible(org uuid,participant uuid,branch uuid,starts timestamptz,ends timestamptz) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,gym AS $$
 SELECT EXISTS(SELECT 1 FROM gym.members m JOIN gym.organizations o ON o.id=m.organization_id WHERE m.organization_id=org AND m.id=participant AND m.archived_at IS NULL
 AND EXISTS(SELECT 1 FROM gym.memberships p WHERE p.organization_id=org AND p.member_id=participant AND p.activated_at IS NOT NULL AND (p.snapshot->>'personalTraining')::boolean
 AND (p.home_branch_id=branch OR p.snapshot->>'accessMode'='all_branches')
 AND p.start_on<=(starts at time zone o.time_zone)::date AND p.end_on_exclusive+o.grace_days>((ends-interval '1 microsecond') at time zone o.time_zone)::date
 AND (p.cancelled_effective_on IS NULL OR p.cancelled_effective_on>((ends-interval '1 microsecond') at time zone o.time_zone)::date)
 AND NOT EXISTS(SELECT 1 FROM gym.membership_freezes f WHERE f.organization_id=p.organization_id AND f.membership_id=p.id AND f.reversed_at IS NULL AND f.start_on<=((ends-interval '1 microsecond') at time zone o.time_zone)::date AND f.end_on_exclusive>(starts at time zone o.time_zone)::date))
 AND (NOT o.debt_blocks_access OR NOT EXISTS(SELECT 1 FROM gym.invoices i JOIN gym.invoice_balances b ON b.organization_id=i.organization_id AND b.invoice_id=i.id WHERE i.organization_id=org AND i.member_id=participant AND i.due_on<=(starts at time zone o.time_zone)::date AND b.balance_minor>0)))
$$;
REVOKE ALL ON FUNCTION gym.pt_member_eligible(uuid,uuid,uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gym.pt_member_eligible(uuid,uuid,uuid,timestamptz,timestamptz) TO gym_runtime;

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
 IF NEW.cancelled_at IS NULL AND participant IS NOT NULL AND NOT gym.pt_member_eligible(NEW.organization_id,participant,NEW.branch_id,NEW.starts_at,NEW.ends_at) THEN RAISE EXCEPTION 'Member needs eligible personal training access for session dates' USING ERRCODE='23514';END IF;
 IF participant IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-member:'||NEW.organization_id::text||':'||participant::text,0));
  IF EXISTS(SELECT 1 FROM gym.personal_sessions p JOIN gym.trainer_assignments a ON a.organization_id=p.organization_id AND a.id=p.assignment_id WHERE p.organization_id=NEW.organization_id AND p.slot_id=NEW.id AND (NOT a.active OR a.start_on>local_start::date OR (a.end_on_exclusive IS NOT NULL AND a.end_on_exclusive<=((NEW.ends_at-interval '1 microsecond') at time zone zone)::date))) THEN RAISE EXCEPTION 'Assignment does not cover session date' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM gym.personal_sessions p JOIN gym.schedule_slots s ON s.organization_id=p.organization_id AND s.id=p.slot_id WHERE p.organization_id=NEW.organization_id AND p.member_id=participant AND p.slot_id<>NEW.id AND s.cancelled_at IS NULL AND s.starts_at<NEW.ends_at AND s.ends_at>NEW.starts_at) OR gym.class_member_conflict(NEW.organization_id,participant,NEW.starts_at,NEW.ends_at,NEW.id) THEN RAISE EXCEPTION 'Member is already in a personal session' USING ERRCODE='23514'; END IF;
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
 IF NOT gym.pt_member_eligible(NEW.organization_id,NEW.member_id,NEW.branch_id,slot.starts_at,slot.ends_at) THEN RAISE EXCEPTION 'Member needs eligible personal training access for session dates' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM gym.personal_sessions p JOIN gym.schedule_slots s ON s.organization_id=p.organization_id AND s.id=p.slot_id WHERE p.organization_id=NEW.organization_id AND p.member_id=NEW.member_id AND s.cancelled_at IS NULL AND s.starts_at<slot.ends_at AND s.ends_at>slot.starts_at) OR gym.class_member_conflict(NEW.organization_id,NEW.member_id,slot.starts_at,slot.ends_at,slot.id) THEN RAISE EXCEPTION 'Member is already in a personal session' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION gym.guard_schedule_slot(),gym.guard_personal_session() FROM PUBLIC;
