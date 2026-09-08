SET search_path TO trios, public;
ALTER TABLE jobs ADD COLUMN access_notes text NOT NULL DEFAULT '';

CREATE TABLE service_changes (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES jobs(id),
  request_id text NOT NULL REFERENCES requests(id),
  user_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('reschedule','cancellation','access','quality')),
  requested_date text NOT NULL DEFAULT '',
  requested_window text NOT NULL DEFAULT '',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','declined','withdrawn')),
  resolution text NOT NULL DEFAULT '',
  resolved_by text NOT NULL DEFAULT '',
  fingerprint text NOT NULL,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE INDEX service_changes_customer ON service_changes(user_id,created_at);
CREATE INDEX service_changes_status ON service_changes(status,created_at);
CREATE UNIQUE INDEX service_changes_one_open ON service_changes(job_id,kind) WHERE status='open';
ALTER TABLE service_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON service_changes FROM PUBLIC;

-- The private server connection owns these records. No browser/Data API grants.
-- Enforce the per-account storage quota across concurrent upload requests.
CREATE FUNCTION guard_upload_quota() RETURNS trigger LANGUAGE plpgsql SET search_path=trios,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('trios-write'));
  IF (SELECT count(*) FROM uploads WHERE user_id=NEW.user_id) >= 200 THEN
    RAISE EXCEPTION 'upload_quota';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER upload_quota_guard BEFORE INSERT ON uploads FOR EACH ROW EXECUTE FUNCTION guard_upload_quota();
REVOKE ALL ON FUNCTION guard_upload_quota() FROM PUBLIC;
