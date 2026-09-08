SET search_path TO trios, public;

CREATE TABLE move_runs (
  job_id text PRIMARY KEY REFERENCES jobs(id),
  version integer NOT NULL CHECK (version > 0),
  stage text NOT NULL CHECK (stage IN ('planning','ready','loading','delivery','walkthrough','completed')),
  checklist text NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(checklist::jsonb)='array'),
  checked_items text NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(checked_items::jsonb)='array'),
  transport_plan text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  updated_at text NOT NULL,
  updated_by text NOT NULL
);
ALTER TABLE move_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON move_runs FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON move_runs FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON move_runs FROM authenticated; END IF;
END $$;
-- Records are served through authenticated, role-scoped server routes only.
CREATE FUNCTION guard_move_run() RETURNS trigger LANGUAGE plpgsql SET search_path=trios,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM jobs WHERE id=NEW.job_id AND service='moving' AND status IN ('scheduled','in_progress')) THEN
    RAISE EXCEPTION 'closed_move';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR NEW.job_id<>OLD.job_id) THEN
    RAISE EXCEPTION 'stale_move';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER move_run_guard BEFORE INSERT OR UPDATE ON move_runs FOR EACH ROW EXECUTE FUNCTION guard_move_run();
REVOKE ALL ON FUNCTION guard_move_run() FROM PUBLIC;

-- Every completion path must include the move-day record; job and run close atomically.
CREATE FUNCTION guard_move_completion() RETURNS trigger LANGUAGE plpgsql SET search_path=trios,pg_temp AS $$
BEGIN
  IF NEW.service='moving' AND NEW.status='completed' AND (TG_OP='INSERT' OR OLD.status<>'completed') THEN
    IF NOT EXISTS(SELECT 1 FROM move_runs WHERE job_id=NEW.id AND stage='completed') THEN RAISE EXCEPTION 'move_checklist_required'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER move_completion_guard BEFORE INSERT OR UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION guard_move_completion();
REVOKE ALL ON FUNCTION guard_move_completion() FROM PUBLIC;
