CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_project` ON `audit_events` (`project_id`,`created`);--> statement-breakpoint
CREATE TABLE `entity_tombstones` (
	`project_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`revision` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tombstone_identity` ON `entity_tombstones` (`project_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `merge_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`actor` text NOT NULL,
	`base_revision` integer NOT NULL,
	`head_revision` integer NOT NULL,
	`incoming` text NOT NULL,
	`conflicts` text NOT NULL,
	`created` integer NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operations` (
	`project_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`actor` text NOT NULL,
	`request_hash` text NOT NULL,
	`response` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operations_identity` ON `operations` (`project_id`,`operation_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `permission_epoch` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `last_operation_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `archived` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `storage_quota` integer DEFAULT 536870912 NOT NULL;