CREATE SCHEMA IF NOT EXISTS trios;
SET search_path TO trios, public;
CREATE TABLE "requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"area" text NOT NULL,
	"postal_code" text NOT NULL,
	"services" text NOT NULL,
	"frequency" text NOT NULL,
	"details" text NOT NULL,
	"estimate" integer,
	"status" text DEFAULT 'requested' NOT NULL,
	"quote_total" integer,
	"quote_terms" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
CREATE TABLE "crew" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"area" text DEFAULT 'St. John’s' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL
);
CREATE UNIQUE INDEX "crew_email" ON "crew" ("email");
CREATE TABLE "equipment" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"next_service" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL
);
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"created_at" text NOT NULL
);
CREATE INDEX "events_user_date" ON "events" ("user_id","created_at");
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"user_id" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"due_date" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"paid_at" text,
	"created_at" text NOT NULL,
	FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON UPDATE no action ON DELETE no action
);
CREATE INDEX "invoices_user" ON "invoices" ("user_id");
CREATE UNIQUE INDEX "invoice_request" ON "invoices" ("request_id");
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"user_id" text NOT NULL,
	"service" text NOT NULL,
	"scheduled_date" text NOT NULL,
	"time_window" text NOT NULL,
	"crew_id" text,
	"priority" text DEFAULT 'Standard' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"photos" text DEFAULT '[]' NOT NULL,
	"labour_minutes" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"completed_at" text,
	FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("crew_id") REFERENCES "crew"("id") ON UPDATE no action ON DELETE no action
);
CREATE INDEX "jobs_user_date" ON "jobs" ("user_id","scheduled_date");
CREATE INDEX "jobs_crew_date" ON "jobs" ("crew_id","scheduled_date");
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"reply" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" text NOT NULL
);
CREATE INDEX "messages_user" ON "messages" ("user_id");
CREATE TABLE "properties" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"address" text NOT NULL,
	"area" text NOT NULL,
	"postal_code" text NOT NULL,
	"details" text DEFAULT '{}' NOT NULL,
	"created_at" text NOT NULL
);
CREATE INDEX "properties_user" ON "properties" ("user_id");
CREATE INDEX "requests_user_created" ON "requests" ("user_id","created_at");
CREATE INDEX "requests_status" ON "requests" ("status");
CREATE TABLE "uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"created_at" text NOT NULL
);
CREATE INDEX "uploads_user" ON "uploads" ("user_id");
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"signer" text NOT NULL,
	"method" text NOT NULL,
	"evidence" text NOT NULL,
	"quote_total" integer NOT NULL,
	"quote_terms" text NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" text NOT NULL,
	FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON UPDATE no action ON DELETE no action
);
CREATE TABLE "commands" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" text NOT NULL
);
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL
);
CREATE UNIQUE INDEX "contacts_email" ON "contacts" ("email");
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text NOT NULL,
	"received_at" text NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" text NOT NULL,
	FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON UPDATE no action ON DELETE no action
);
CREATE INDEX "payments_invoice" ON "payments" ("invoice_id");
CREATE TABLE "planner_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "business_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" text NOT NULL
);
ALTER TABLE "jobs" ADD "version" integer DEFAULT 0 NOT NULL;
ALTER TABLE "approvals" ADD "quote_version" text DEFAULT '' NOT NULL;

CREATE UNIQUE INDEX jobs_unique_active_visit ON jobs (request_id,service,scheduled_date,lower(trim(time_window))) WHERE status!='cancelled';
CREATE FUNCTION guard_job() RETURNS trigger LANGUAGE plpgsql SET search_path=trios,pg_temp AS $$
DECLARE capacity integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('trios-write'));
 IF TG_OP='UPDATE' THEN
  IF OLD.status IN ('completed','cancelled') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'closed_visit'; END IF;
 END IF;
 IF NEW.crew_id IS NOT NULL AND NEW.status IN ('scheduled','in_progress') AND (TG_OP='INSERT' OR OLD.crew_id IS DISTINCT FROM NEW.crew_id OR OLD.scheduled_date<>NEW.scheduled_date) THEN
  SELECT COALESCE((value::jsonb->>'dailyCapacity')::integer,12) INTO capacity FROM business_settings WHERE id='operations';
  IF (SELECT COUNT(*) FROM jobs WHERE id<>NEW.id AND crew_id=NEW.crew_id AND scheduled_date=NEW.scheduled_date AND status IN ('scheduled','in_progress')) >= COALESCE(capacity,12) THEN RAISE EXCEPTION 'crew_capacity'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER job_guard BEFORE INSERT OR UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION guard_job();
CREATE FUNCTION guard_job_version() RETURNS trigger LANGUAGE plpgsql SET search_path=trios,pg_temp AS $$
BEGIN
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'stale_visit'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER job_version_guard BEFORE UPDATE OF version ON jobs FOR EACH ROW EXECUTE FUNCTION guard_job_version();
CREATE FUNCTION guard_payment() RETURNS trigger LANGUAGE plpgsql SET search_path=trios,pg_temp AS $$
DECLARE invoice_total integer; already_paid bigint;
BEGIN
 SELECT amount_cents+tax_cents INTO invoice_total FROM invoices WHERE id=NEW.invoice_id FOR UPDATE;
 SELECT COALESCE(SUM(amount_cents),0) INTO already_paid FROM payments WHERE invoice_id=NEW.invoice_id;
 IF invoice_total IS NULL OR NEW.amount_cents<=0 OR NEW.amount_cents>invoice_total-already_paid THEN RAISE EXCEPTION 'payment_exceeds_balance'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_guard BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION guard_payment();
CREATE FUNCTION guard_approval() RETURNS trigger LANGUAGE plpgsql SET search_path=trios,pg_temp AS $$
DECLARE item requests%ROWTYPE;
BEGIN
 SELECT * INTO item FROM requests WHERE id=NEW.request_id FOR UPDATE;
 IF item.id IS NULL OR item.status<>'quoted' OR item.updated_at<>NEW.quote_version OR item.quote_total<>NEW.quote_total OR item.quote_terms<>NEW.quote_terms THEN RAISE EXCEPTION 'stale_approval'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER approval_guard BEFORE INSERT ON approvals FOR EACH ROW EXECUTE FUNCTION guard_approval();
REVOKE ALL ON SCHEMA trios FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA trios FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA trios FROM PUBLIC;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='trios' LOOP
  EXECUTE format('ALTER TABLE trios.%I ENABLE ROW LEVEL SECURITY',t.tablename);
 END LOOP;
END $$;
