CREATE TABLE `crew` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`area` text DEFAULT 'St. John’s' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crew_email` ON `crew` (`email`);--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`next_service` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_user_date` ON `events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`paid_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invoices_user` ON `invoices` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_request` ON `invoices` (`request_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`service` text NOT NULL,
	`scheduled_date` text NOT NULL,
	`time_window` text NOT NULL,
	`crew_id` text,
	`priority` text DEFAULT 'Standard' NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`photos` text DEFAULT '[]' NOT NULL,
	`labour_minutes` integer DEFAULT 0 NOT NULL,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`crew_id`) REFERENCES `crew`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `jobs_user_date` ON `jobs` (`user_id`,`scheduled_date`);--> statement-breakpoint
CREATE INDEX `jobs_crew_date` ON `jobs` (`crew_id`,`scheduled_date`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`reply` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_user` ON `messages` (`user_id`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`address` text NOT NULL,
	`area` text NOT NULL,
	`postal_code` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `properties_user` ON `properties` (`user_id`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`address` text NOT NULL,
	`area` text NOT NULL,
	`postal_code` text NOT NULL,
	`services` text NOT NULL,
	`frequency` text NOT NULL,
	`details` text NOT NULL,
	`estimate` integer,
	`status` text DEFAULT 'requested' NOT NULL,
	`quote_total` integer,
	`quote_terms` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `requests_user_created` ON `requests` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `requests_status` ON `requests` (`status`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `uploads_user` ON `uploads` (`user_id`);