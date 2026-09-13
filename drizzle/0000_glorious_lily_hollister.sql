CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`key` text NOT NULL,
	`hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assets_project` ON `assets` (`project_id`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`author` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`time` real NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_project` ON `comments` (`project_id`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`token` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`role` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `members_user` ON `members` (`user_id`);--> statement-breakpoint
CREATE INDEX `members_project` ON `members` (`project_id`);--> statement-breakpoint
CREATE TABLE `presence` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`position` real NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `presence_project` ON `presence` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`document` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`revision` integer NOT NULL,
	`document` text NOT NULL,
	`author` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `versions_project` ON `versions` (`project_id`,`revision`);