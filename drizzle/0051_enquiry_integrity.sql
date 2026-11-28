-- Retain converted identities and completed follow-up history.
CREATE FUNCTION gym.guard_enquiry_history() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.branch_id<>OLD.branch_id OR NEW.created_at<>OLD.created_at THEN
  RAISE EXCEPTION 'Enquiry identity is immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.converted_member_id IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
  RAISE EXCEPTION 'Converted enquiry history is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'Enquiry revision must advance once' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION gym.guard_enquiry_history() FROM PUBLIC;
CREATE TRIGGER enquiry_history BEFORE UPDATE ON gym.enquiries FOR EACH ROW EXECUTE FUNCTION gym.guard_enquiry_history();
--> statement-breakpoint
CREATE FUNCTION gym.guard_follow_up_history() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,gym AS $$
BEGIN
 IF OLD.completed_at IS NOT NULL OR NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.branch_id<>OLD.branch_id OR NEW.enquiry_id<>OLD.enquiry_id OR NEW.action<>OLD.action OR NEW.due_on<>OLD.due_on OR NEW.completed_at IS NULL OR NEW.completed_by IS NULL THEN
  RAISE EXCEPTION 'Follow-up completion is retained' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION gym.guard_follow_up_history() FROM PUBLIC;
CREATE TRIGGER follow_up_history BEFORE UPDATE ON gym.follow_up_tasks FOR EACH ROW EXECUTE FUNCTION gym.guard_follow_up_history();
