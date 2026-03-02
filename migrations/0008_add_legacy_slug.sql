-- Add legacy_slug columns to preserve old text-based slugs for 301 redirects
-- After runtime migration: slug → short ID, legacy_slug → original text slug
ALTER TABLE posts ADD COLUMN legacy_slug text;
--> statement-breakpoint
ALTER TABLE guitar_tab_metadata ADD COLUMN legacy_slug text;
