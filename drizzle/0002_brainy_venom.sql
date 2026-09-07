ALTER TABLE `approvals` ADD `quote_version` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE TRIGGER job_version_guard BEFORE UPDATE OF version ON jobs
WHEN NEW.version != OLD.version+1
BEGIN SELECT RAISE(ABORT, 'stale_visit'); END;
--> statement-breakpoint
CREATE TRIGGER approval_guard BEFORE INSERT ON approvals
WHEN NOT EXISTS(SELECT 1 FROM requests WHERE id=NEW.request_id AND status='quoted' AND updated_at=NEW.quote_version AND quote_total=NEW.quote_total AND quote_terms=NEW.quote_terms)
BEGIN SELECT RAISE(ABORT, 'stale_approval'); END;
--> statement-breakpoint
CREATE TRIGGER job_capacity_insert BEFORE INSERT ON jobs
WHEN NEW.crew_id IS NOT NULL AND NEW.status IN ('scheduled','in_progress') AND (SELECT COUNT(*) FROM jobs WHERE crew_id=NEW.crew_id AND scheduled_date=NEW.scheduled_date AND status IN ('scheduled','in_progress'))>=COALESCE((SELECT json_extract(value,'$.dailyCapacity') FROM business_settings WHERE id='operations'),12)
BEGIN SELECT RAISE(ABORT, 'crew_capacity'); END;
--> statement-breakpoint
CREATE TRIGGER job_capacity_update BEFORE UPDATE OF crew_id,scheduled_date,status ON jobs
WHEN NEW.crew_id IS NOT NULL AND NEW.status IN ('scheduled','in_progress') AND (OLD.crew_id IS NOT NEW.crew_id OR OLD.scheduled_date!=NEW.scheduled_date) AND (SELECT COUNT(*) FROM jobs WHERE id!=NEW.id AND crew_id=NEW.crew_id AND scheduled_date=NEW.scheduled_date AND status IN ('scheduled','in_progress'))>=COALESCE((SELECT json_extract(value,'$.dailyCapacity') FROM business_settings WHERE id='operations'),12)
BEGIN SELECT RAISE(ABORT, 'crew_capacity'); END;
