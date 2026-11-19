ALTER TABLE `media` ADD `pack_id` text REFERENCES packs(id) ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX `media_pack_idx` ON `media` (`pack_id`);
--> statement-breakpoint
ALTER TABLE `releases` ADD `clean_install` integer DEFAULT false NOT NULL;
