-- Preserve the fork's comments before upstream rebuilds the post-only table.
-- This runs after the original 0000–0009 migrations on both new and existing DBs.
CREATE TABLE `guitar_tab_comments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `content` text,
  `root_id` integer REFERENCES `guitar_tab_comments`(`id`) ON DELETE cascade,
  `reply_to_comment_id` integer REFERENCES `guitar_tab_comments`(`id`) ON DELETE set null,
  `status` text DEFAULT 'published' NOT NULL,
  `guitar_tab_id` integer NOT NULL REFERENCES `guitar_tab_metadata`(`id`) ON DELETE cascade,
  `user_id` text REFERENCES `user`(`id`) ON DELETE set null,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `guitar_tab_comments`
  (`id`, `content`, `root_id`, `reply_to_comment_id`, `status`, `guitar_tab_id`, `user_id`, `created_at`, `updated_at`)
SELECT `id`, `content`, `root_id`, `reply_to_comment_id`, `status`, `guitar_tab_id`, `user_id`, `created_at`, `updated_at`
FROM `comments` WHERE `guitar_tab_id` IS NOT NULL;
--> statement-breakpoint
DELETE FROM `comments` WHERE `guitar_tab_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `guitar_comments_tab_created_idx` ON `guitar_tab_comments` (`guitar_tab_id`, `created_at`);

--> statement-breakpoint
UPDATE `guitar_tab_comments`
SET `content` = trim(COALESCE((
  SELECT group_concat(para_text, CHAR(10))
  FROM (
    SELECT
      CAST(para.key AS INTEGER) AS para_ord,
      (
        SELECT group_concat(piece, '')
        FROM (
          SELECT
            CAST(inline.key AS INTEGER) AS inline_ord,
            CASE json_extract(inline.value, '$.type')
              WHEN 'hardBreak' THEN CHAR(10)
              WHEN 'image' THEN (
                CASE
                  WHEN json_extract(inline.value, '$.attrs.src') IS NOT NULL
                   AND json_extract(inline.value, '$.attrs.src') != ''
                  THEN CHAR(10) || json_extract(inline.value, '$.attrs.src') || CHAR(10)
                  ELSE ''
                END
              )
              WHEN 'text' THEN (
                COALESCE(json_extract(inline.value, '$.text'), '') ||
                CASE
                  WHEN (
                    SELECT json_extract(m.value, '$.attrs.href')
                    FROM json_each(COALESCE(json_extract(inline.value, '$.marks'), '[]')) AS m
                    WHERE json_extract(m.value, '$.type') = 'link'
                    LIMIT 1
                  ) IS NOT NULL
                  AND (
                    SELECT json_extract(m.value, '$.attrs.href')
                    FROM json_each(COALESCE(json_extract(inline.value, '$.marks'), '[]')) AS m
                    WHERE json_extract(m.value, '$.type') = 'link'
                    LIMIT 1
                  ) != COALESCE(json_extract(inline.value, '$.text'), '')
                  THEN ' ' || (
                    SELECT json_extract(m.value, '$.attrs.href')
                    FROM json_each(COALESCE(json_extract(inline.value, '$.marks'), '[]')) AS m
                    WHERE json_extract(m.value, '$.type') = 'link'
                    LIMIT 1
                  )
                  ELSE ''
                END
              )
              ELSE ''
            END AS piece
          FROM json_each(COALESCE(json_extract(para.value, '$.content'), '[]')) AS inline
          ORDER BY CAST(inline.key AS INTEGER)
        )
      ) AS para_text
    FROM json_each(COALESCE(json_extract(`guitar_tab_comments`.`content`, '$.content'), '[]')) AS para
    ORDER BY CAST(para.key AS INTEGER)
  )
), ''), CHAR(10) || CHAR(13) || ' ')
WHERE json_valid(`content`)
  AND json_type(`content`) = 'object'
  AND json_extract(`content`, '$.type') = 'doc';
