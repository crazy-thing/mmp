CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`session_log` text NOT NULL,
	`game_log` text,
	`pack_slug` text,
	`pack_name` text,
	`release_name` text,
	`launcher_version` text NOT NULL,
	`player_uuid` text,
	`player_name` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reports_created_idx` ON `reports` (`created_at`);
