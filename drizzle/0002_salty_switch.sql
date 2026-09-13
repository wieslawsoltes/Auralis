CREATE TABLE `asset_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`actor` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`chunk_size` integer NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL,
	`complete` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `upload_project` ON `asset_uploads` (`project_id`);--> statement-breakpoint
CREATE TABLE `upload_chunks` (
	`upload_id` text NOT NULL,
	`part` integer NOT NULL,
	`key` text NOT NULL,
	`hash` text NOT NULL,
	`size` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chunk_identity` ON `upload_chunks` (`upload_id`,`part`);--> statement-breakpoint
ALTER TABLE `assets` ADD `manifest` text;