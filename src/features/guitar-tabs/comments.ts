import { ORPCError } from "@orpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  GuitarTabCommentsTable as Comments,
  GuitarTabMetadataTable as Tabs,
  user,
} from "@/lib/db/schema";
import {
  authProcedure,
  publicProcedure,
  turnstileMiddleware,
  withRateLimit,
} from "@/lib/orpc/procedure";
import type { ApiContext } from "@/lib/orpc/context";

const tabId = z.number().int().positive();

async function requirePublicTab(context: ApiContext, id: number) {
  const tab = await context.db
    .select({ id: Tabs.id })
    .from(Tabs)
    .where(and(eq(Tabs.id, id), eq(Tabs.status, "approved")))
    .get();
  if (!tab) throw new ORPCError("NOT_FOUND");
}

const list = publicProcedure
  .route({ method: "GET", path: "/guitar-tabs/{guitarTabId}/comments" })
  .input(z.object({ guitarTabId: tabId }))
  .handler(async ({ context, input }) => {
    await requirePublicTab(context, input.guitarTabId);
    return context.db
      .select({
        id: Comments.id,
        content: Comments.content,
        rootId: Comments.rootId,
        replyToCommentId: Comments.replyToCommentId,
        userId: Comments.userId,
        status: Comments.status,
        createdAt: Comments.createdAt,
        userName: user.name,
        userImage: user.image,
      })
      .from(Comments)
      .leftJoin(user, eq(Comments.userId, user.id))
      .where(
        and(
          eq(Comments.guitarTabId, input.guitarTabId),
          eq(Comments.status, "published"),
        ),
      )
      .orderBy(asc(Comments.createdAt), asc(Comments.id));
  });

const create = authProcedure
  .use(
    withRateLimit({
      capacity: 10,
      interval: "1m",
      key: "guitar-comments:create",
    }),
  )
  .use(turnstileMiddleware)
  .route({ method: "POST", path: "/guitar-tabs/{guitarTabId}/comments" })
  .input(
    z.object({
      guitarTabId: tabId,
      content: z.string().trim().min(1).max(4000),
      replyToCommentId: tabId.optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    await requirePublicTab(context, input.guitarTabId);
    const author = await context.db
      .select({ mutedAt: user.mutedAt })
      .from(user)
      .where(eq(user.id, context.session.user.id))
      .get();
    if (author?.mutedAt)
      throw new ORPCError("FORBIDDEN", { message: "当前账号暂时不能发表评论" });
    let rootId: number | null = null;
    if (input.replyToCommentId) {
      const target = await context.db
        .select()
        .from(Comments)
        .where(
          and(
            eq(Comments.id, input.replyToCommentId),
            eq(Comments.guitarTabId, input.guitarTabId),
            eq(Comments.status, "published"),
          ),
        )
        .get();
      if (!target) throw new ORPCError("NOT_FOUND");
      rootId = target.rootId ?? target.id;
    }
    const [comment] = await context.db
      .insert(Comments)
      .values({
        guitarTabId: input.guitarTabId,
        content: input.content,
        userId: context.session.user.id,
        rootId,
        replyToCommentId: input.replyToCommentId,
      })
      .returning({ id: Comments.id });
    return comment;
  });

const remove = authProcedure
  .route({ method: "DELETE", path: "/guitar-tabs/{guitarTabId}/comments/{id}" })
  .input(z.object({ guitarTabId: tabId, id: tabId }))
  .handler(async ({ context, input }) => {
    const comment = await context.db
      .select()
      .from(Comments)
      .where(
        and(
          eq(Comments.id, input.id),
          eq(Comments.guitarTabId, input.guitarTabId),
        ),
      )
      .get();
    if (!comment) throw new ORPCError("NOT_FOUND");
    if (
      comment.userId !== context.session.user.id &&
      context.session.user.role !== "admin"
    )
      throw new ORPCError("FORBIDDEN");
    await context.db
      .update(Comments)
      .set({ content: "[评论已删除]", userId: null, updatedAt: new Date() })
      .where(eq(Comments.id, input.id));
    return { success: true };
  });

export default { list, create, remove };
