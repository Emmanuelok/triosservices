CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`signer` text NOT NULL,
	`method` text NOT NULL,
	`evidence` text NOT NULL,
	`quote_total` integer NOT NULL,
	`quote_terms` text NOT NULL,
	`recorded_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `commands` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_email` ON `contacts` (`email`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text NOT NULL,
	`received_at` text NOT NULL,
	`recorded_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payments_invoice` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `planner_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `business_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `jobs` ADD `version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
INSERT INTO payments (id,invoice_id,amount_cents,method,reference,received_at,recorded_by,created_at)
SELECT 'legacy:' || id,id,amount_cents+tax_cents,'Previously verified',reference,substr(COALESCE(paid_at,created_at),1,10),'Migration',COALESCE(paid_at,created_at) FROM invoices WHERE status='paid' AND amount_cents+tax_cents>0;
--> statement-breakpoint
CREATE TRIGGER payment_balance_guard BEFORE INSERT ON payments
WHEN NEW.amount_cents <= 0 OR NEW.amount_cents > (SELECT amount_cents+tax_cents-COALESCE((SELECT SUM(amount_cents) FROM payments WHERE invoice_id=NEW.invoice_id),0) FROM invoices WHERE id=NEW.invoice_id)
BEGIN SELECT RAISE(ABORT, 'payment_exceeds_balance'); END;
--> statement-breakpoint
CREATE TRIGGER job_duplicate_insert BEFORE INSERT ON jobs
WHEN NEW.status != 'cancelled' AND EXISTS(SELECT 1 FROM jobs WHERE request_id=NEW.request_id AND service=NEW.service AND scheduled_date=NEW.scheduled_date AND lower(trim(time_window))=lower(trim(NEW.time_window)) AND status!='cancelled')
BEGIN SELECT RAISE(ABORT, 'duplicate_visit'); END;
--> statement-breakpoint
CREATE TRIGGER job_duplicate_move BEFORE UPDATE OF scheduled_date,time_window ON jobs
WHEN NEW.status != 'cancelled' AND (OLD.scheduled_date != NEW.scheduled_date OR lower(trim(OLD.time_window)) != lower(trim(NEW.time_window))) AND EXISTS(SELECT 1 FROM jobs WHERE id!=NEW.id AND request_id=NEW.request_id AND service=NEW.service AND scheduled_date=NEW.scheduled_date AND lower(trim(time_window))=lower(trim(NEW.time_window)) AND status!='cancelled')
BEGIN SELECT RAISE(ABORT, 'duplicate_visit'); END;
--> statement-breakpoint
CREATE TRIGGER job_terminal_guard BEFORE UPDATE OF status ON jobs
WHEN OLD.status IN ('completed','cancelled') AND NEW.status!=OLD.status
BEGIN SELECT RAISE(ABORT, 'closed_visit'); END;
