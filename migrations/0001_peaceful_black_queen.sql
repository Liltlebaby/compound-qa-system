ALTER TABLE `members` ADD `factories` text DEFAULT '["AJ2","AJ2B"]' NOT NULL;--> statement-breakpoint
ALTER TABLE `rounds` ADD `factory` text DEFAULT 'AJ2' NOT NULL;