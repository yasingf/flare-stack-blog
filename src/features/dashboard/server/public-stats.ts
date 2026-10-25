import { count, isNotNull } from "drizzle-orm";
import { publicProcedure } from "@/lib/orpc/procedure";
import { PostsTable } from "@/lib/db/schema";
import { getApprovedCount } from "@/features/media/data/guitar-tab-metadata.data";
import * as Tags from "@/features/tags/tags.service";

export const publicStats = publicProcedure
  .route({ method: "GET", path: "/site/stats" })
  .handler(async ({ context }) => {
    const [posts, tags, totalGuitarTabs] = await Promise.all([
      context.db
        .select({ total: count() })
        .from(PostsTable)
        .where(isNotNull(PostsTable.publicSnapshotJson)),
      Tags.getPublicTags(context),
      getApprovedCount(context.db),
    ]);
    return {
      totalPosts: posts[0].total,
      totalTags: tags.length,
      totalGuitarTabs,
    };
  });
