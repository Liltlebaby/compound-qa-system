CREATE TABLE `audits` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`round_id` text NOT NULL,
	`station_id` text NOT NULL,
	`order_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`at` text NOT NULL,
	`before` text,
	`after` text NOT NULL,
	`reason` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`stations` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_email_unique` ON `members` (`email`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`revision` integer NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`completed_at` text NOT NULL,
	`created_at` text NOT NULL,
	`changes` text NOT NULL,
	`facts` text NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_content` ON `reports` (`round_id`,`fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `report_revision` ON `reports` (`round_id`,`revision`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`body_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`shift` text NOT NULL,
	`line` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`end_at` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`at` text NOT NULL,
	`action` text NOT NULL,
	`details` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`order_id` text NOT NULL,
	`station_id` text NOT NULL,
	`payload` text NOT NULL,
	`operator_id` text NOT NULL,
	`operator_name` text NOT NULL,
	`submitted_at` text NOT NULL,
	`version` integer NOT NULL,
	`last_request_id` text NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_slot` ON `submissions` (`round_id`,`order_id`,`station_id`);--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`config` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
