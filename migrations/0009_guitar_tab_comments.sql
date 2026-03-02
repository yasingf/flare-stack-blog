-- Migration: Make postId nullable and add guitarTabId for guitar tab comments
-- SQLite doesn't support ALTER COLUMN, so we recreate the table

PRAGMA foreign_keys=OFF;
--> statement-breakpoint

CREATE TABLE `comments_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text,
	`root_id` integer,
	`reply_to_comment_id` integer,
	`status` text DEFAULT 'verifying' NOT NULL,
	`ai_reason` text,
	`post_id` integer,
	`guitar_tab_id` integer,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`root_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reply_to_comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guitar_tab_id`) REFERENCES `guitar_tab_metadata`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint

INSERT INTO `comments_new` (`id`, `content`, `root_id`, `reply_to_comment_id`, `status`, `ai_reason`, `post_id`, `user_id`, `created_at`, `updated_at`)
SELECT `id`, `content`, `root_id`, `reply_to_comment_id`, `status`, `ai_reason`, `post_id`, `user_id`, `created_at`, `updated_at`
FROM `comments`;
--> statement-breakpoint

DROP TABLE `comments`;
--> statement-breakpoint

ALTER TABLE `comments_new` RENAME TO `comments`;
--> statement-breakpoint

CREATE INDEX `comments_post_root_created_idx` ON `comments` (`post_id`,`root_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `comments_user_created_idx` ON `comments` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `comments_status_created_idx` ON `comments` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `comments_global_created_idx` ON `comments` (`created_at`);
--> statement-breakpoint
CREATE INDEX `comments_guitar_tab_root_created_idx` ON `comments` (`guitar_tab_id`,`root_id`,`created_at`);
--> statement-breakpoint

PRAGMA foreign_keys=ON;
