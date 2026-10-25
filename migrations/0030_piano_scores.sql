CREATE TABLE `piano_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`hash` text NOT NULL,
	`title` text NOT NULL,
	`file_name` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `piano_scores_user_hash` ON `piano_scores` (`user_id`,`hash`);--> statement-breakpoint
CREATE INDEX `piano_scores_user_created` ON `piano_scores` (`user_id`,`created_at`);