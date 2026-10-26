CREATE TABLE `piano_article_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`auto_generate` integer DEFAULT true NOT NULL,
	CONSTRAINT "piano_article_settings_singleton" CHECK("piano_article_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `piano_score_articles` (
	`score_id` text PRIMARY KEY NOT NULL,
	`post_id` integer,
	`requested_by` text NOT NULL,
	`request_id` text NOT NULL,
	`artist_hint` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`score_id`) REFERENCES `piano_scores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE set null
);
