import { renderToStaticMarkup } from "react-dom/server";
import type {
  CreateCommentInput,
  DeleteCommentInput,
  GetAllCommentsInput,
  GetCommentsByPostIdInput,
  GetMyCommentsInput,
  ModerateCommentInput,
  StartCommentModerationInput,
} from "@/features/comments/comments.schema";
import * as CommentRepo from "@/features/comments/data/comments.data";
import * as PostService from "@/features/posts/posts.service";
import { AdminNotificationEmail } from "@/features/email/templates/AdminNotificationEmail";
import { convertToPlainText } from "@/features/posts/utils/content";
import { sendReplyNotification } from "@/features/comments/workflows/helpers";
import { serverEnv } from "@/lib/env/server.env";
import { err, ok } from "@/lib/error";

// ============ Public Service Methods ============

export async function getRootCommentsByPostId(
  context: DbContext,
  data: GetCommentsByPostIdInput & { viewerId?: string },
) {
  const postId = data.postId ?? 0;
  const [items, total] = await Promise.all([
    CommentRepo.getRootCommentsByPostId(context.db, postId, {
      guitarTabId: data.guitarTabId,
      offset: data.offset,
      limit: data.limit,
      viewerId: data.viewerId,
      status: data.viewerId ? undefined : ["published", "deleted"],
    }),
    CommentRepo.getRootCommentsByPostIdCount(context.db, postId, {
      guitarTabId: data.guitarTabId,
      viewerId: data.viewerId,
      status: data.viewerId ? undefined : ["published", "deleted"],
    }),
  ]);

  // Get reply counts for each root comment
  const itemsWithReplyCount = await Promise.all(
    items.map(async (item) => {
      const replyCount = await CommentRepo.getReplyCountByRootId(
        context.db,
        postId,
        item.id,
        {
          guitarTabId: data.guitarTabId,
          viewerId: data.viewerId,
          status: data.viewerId ? undefined : ["published", "deleted"],
        },
      );
      return { ...item, replyCount };
    }),
  );

  return { items: itemsWithReplyCount, total };
}

export async function getRepliesByRootId(
  context: DbContext,
  data: {
    postId?: number;
    guitarTabId?: number;
    rootId: number;
    offset?: number;
    limit?: number;
  } & {
    viewerId?: string;
  },
) {
  const postId = data.postId ?? 0;
  const [items, total] = await Promise.all([
    CommentRepo.getRepliesByRootId(context.db, postId, data.rootId, {
      guitarTabId: data.guitarTabId,
      offset: data.offset,
      limit: data.limit,
      viewerId: data.viewerId,
      status: data.viewerId ? undefined : ["published", "deleted"],
    }),
    CommentRepo.getRepliesByRootIdCount(context.db, postId, data.rootId, {
      guitarTabId: data.guitarTabId,
      viewerId: data.viewerId,
      status: data.viewerId ? undefined : ["published", "deleted"],
    }),
  ]);

  return { items, total };
}

// ============ Authed User Service Methods ============

export async function createComment(
  context: AuthContext,
  data: CreateCommentInput,
) {
  // Validation: ensure 2-level structure
  let rootId: number | null = null;
  let replyToCommentId: number | null = null;

  if (data.rootId) {
    // Creating a reply - validate rootId exists and is a root comment
    const rootComment = await CommentRepo.findCommentById(
      context.db,
      data.rootId,
    );
    if (!rootComment) {
      return err({ reason: "ROOT_COMMENT_NOT_FOUND" });
    }
    if (rootComment.rootId !== null) {
      return err({ reason: "INVALID_ROOT_ID" });
    }
    // For post comments, check postId match; for guitar tab comments, check guitarTabId match
    if (data.postId && rootComment.postId !== data.postId) {
      return err({ reason: "ROOT_COMMENT_POST_MISMATCH" });
    }
    if (data.guitarTabId && rootComment.guitarTabId !== data.guitarTabId) {
      return err({ reason: "ROOT_COMMENT_POST_MISMATCH" });
    }
    rootId = data.rootId;

    // If replyToCommentId is provided, validate it belongs to the same root
    if (data.replyToCommentId) {
      const replyToComment = await CommentRepo.findCommentById(
        context.db,
        data.replyToCommentId,
      );
      if (!replyToComment) {
        return err({ reason: "REPLY_TO_COMMENT_NOT_FOUND" });
      }
      // replyToComment must be either the root or a reply under the same root
      const actualRootId = replyToComment.rootId ?? replyToComment.id;
      if (actualRootId !== rootId) {
        return err({ reason: "REPLY_TO_COMMENT_ROOT_MISMATCH" });
      }
      replyToCommentId = data.replyToCommentId;
    } else {
      // If no replyToCommentId, default to replying to the root
      replyToCommentId = rootId;
    }
  } else {
    // Creating a root comment - ensure no replyToCommentId
    if (data.replyToCommentId) {
      return err({ reason: "ROOT_COMMENT_CANNOT_HAVE_REPLY_TO" });
    }
  }

  const isAdmin = context.session.user.role === "admin";

  const comment = await CommentRepo.insertComment(context.db, {
    postId: data.postId ?? null,
    guitarTabId: data.guitarTabId ?? null,
    content: data.content,
    rootId,
    replyToCommentId,
    userId: context.session.user.id,
    // Admin comments are published immediately, others go through moderation
    status: isAdmin ? "published" : "verifying",
  });

  // Trigger AI moderation workflow only for non-admin users
  if (!isAdmin) {
    await startCommentModerationWorkflow(context, { commentId: comment.id });
  }

  // Determine the target info for notifications
  const targetInfo = await getCommentTargetInfo(context, data);

  // Send reply notification for admin replies (non-admin replies get notified via moderation workflow)
  if (isAdmin && replyToCommentId && targetInfo) {
    await sendReplyNotification(context.db, context.env, {
      comment: {
        id: comment.id,
        rootId: comment.rootId,
        replyToCommentId: comment.replyToCommentId,
        userId: comment.userId,
        content: data.content,
      },
      target: targetInfo,
    });
  }

  // Notify admin about new root comments from non-admin users only
  const isRootComment = rootId === null;
  if (!isAdmin && isRootComment && targetInfo) {
    const { ADMIN_EMAIL, DOMAIN } = serverEnv(context.env);
    const commentPreview = convertToPlainText(data.content).slice(0, 100);
    const commenterName = context.session.user.name;

    const commentUrl = buildCommentUrl(
      DOMAIN,
      targetInfo,
      comment.id,
      comment.id,
    );

    const emailHtml = renderToStaticMarkup(
      AdminNotificationEmail({
        postTitle: targetInfo.title,
        commenterName,
        commentPreview: `${commentPreview}${commentPreview.length >= 100 ? "..." : ""}`,
        commentUrl,
      }),
    );

    await context.env.QUEUE.send({
      type: "EMAIL",
      data: {
        to: ADMIN_EMAIL,
        subject: `[新评论] ${targetInfo.title}`,
        html: emailHtml,
      },
    });
  }

  return ok(comment);
}

/** Resolve the post or guitar tab info for a comment target */
async function getCommentTargetInfo(
  context: DbContext,
  data: { postId?: number; guitarTabId?: number },
): Promise<{ type: "post" | "guitarTab"; slug: string; title: string } | null> {
  if (data.postId) {
    const post = await PostService.findPostById(context, {
      id: data.postId,
    });
    if (post) {
      return { type: "post", slug: post.slug, title: post.title };
    }
  }
  if (data.guitarTabId) {
    // Look up guitar tab info directly
    const tab = await context.db.query.GuitarTabMetadataTable.findFirst({
      where: (t, { eq }) => eq(t.id, data.guitarTabId!),
      columns: { slug: true, title: true },
    });
    if (tab) {
      return {
        type: "guitarTab",
        slug: tab.slug ?? String(data.guitarTabId),
        title: tab.title || "吉他谱",
      };
    }
  }
  return null;
}

/** Build the full comment URL for notifications */
function buildCommentUrl(
  domain: string,
  target: { type: "post" | "guitarTab"; slug: string },
  commentId: number,
  rootId: number,
): string {
  const basePath =
    target.type === "post"
      ? `/post/${target.slug}`
      : `/guitar-tab/${target.slug}`;
  return `https://${domain}${basePath}?highlightCommentId=${commentId}&rootId=${rootId}#comment-${commentId}`;
}

export async function deleteComment(
  context: AuthContext,
  data: DeleteCommentInput,
) {
  const comment = await CommentRepo.findCommentById(context.db, data.id);

  if (!comment) {
    throw new Error("COMMENT_NOT_FOUND");
  }

  // Only allow deleting own comments (unless admin)
  const userRole = context.session.user.role;
  if (comment.userId !== context.session.user.id && userRole !== "admin") {
    throw new Error("PERMISSION_DENIED");
  }

  // Soft delete by setting status to deleted
  await CommentRepo.updateComment(context.db, data.id, {
    status: "deleted",
  });

  return { success: true };
}

export async function getMyComments(
  context: AuthContext,
  data: GetMyCommentsInput,
) {
  const comments = await CommentRepo.getCommentsByUserId(
    context.db,
    context.session.user.id,
    {
      offset: data.offset,
      limit: data.limit,
      status: data.status,
    },
  );

  return comments;
}

// ============ Admin Service Methods ============

export async function getAllComments(
  context: DbContext,
  data: GetAllCommentsInput,
) {
  const [items, total] = await Promise.all([
    CommentRepo.getAllComments(context.db, {
      offset: data.offset,
      limit: data.limit,
      status: data.status,
      postId: data.postId,
      userId: data.userId,
      userName: data.userName,
    }),
    CommentRepo.getAllCommentsCount(context.db, {
      status: data.status,
      postId: data.postId,
      userId: data.userId,
      userName: data.userName,
    }),
  ]);

  return { items, total };
}

export async function moderateComment(
  context: DbContext,
  data: ModerateCommentInput,
  moderatorUserId?: string,
) {
  const comment = await CommentRepo.findCommentById(context.db, data.id);

  if (!comment) {
    throw new Error("COMMENT_NOT_FOUND");
  }

  const updatedComment = await CommentRepo.updateComment(context.db, data.id, {
    status: data.status,
  });

  // Send reply notification when manually approving a reply comment
  // Guard: only on first approval (comment.status !== "published") to prevent duplicates
  if (
    data.status === "published" &&
    comment.status !== "published" &&
    comment.replyToCommentId
  ) {
    const targetInfo = await getCommentTargetInfo(context, {
      postId: comment.postId ?? undefined,
      guitarTabId: comment.guitarTabId ?? undefined,
    });
    if (targetInfo) {
      await sendReplyNotification(context.db, context.env, {
        comment: {
          id: comment.id,
          rootId: comment.rootId,
          replyToCommentId: comment.replyToCommentId,
          userId: comment.userId,
          content: comment.content,
        },
        target: { slug: targetInfo.slug, title: targetInfo.title, type: targetInfo.type },
        skipNotifyUserId: moderatorUserId,
      });
    }
  }

  return updatedComment;
}

export async function adminDeleteComment(
  context: DbContext,
  data: DeleteCommentInput,
) {
  const comment = await CommentRepo.findCommentById(context.db, data.id);

  if (!comment) {
    throw new Error("COMMENT_NOT_FOUND");
  }

  // Hard delete for admin
  await CommentRepo.deleteComment(context.db, data.id);

  return { success: true };
}

// ============ Workflow Methods ============

export async function startCommentModerationWorkflow(
  context: DbContext,
  data: StartCommentModerationInput,
) {
  await context.env.COMMENT_MODERATION_WORKFLOW.create({
    params: {
      commentId: data.commentId,
    },
  });
}

export async function findCommentById(context: DbContext, commentId: number) {
  return await CommentRepo.findCommentById(context.db, commentId);
}

export async function updateCommentStatus(
  context: DbContext,
  commentId: number,
  status: "published" | "pending" | "deleted",
  aiReason?: string,
) {
  return await CommentRepo.updateComment(context.db, commentId, {
    status,
    aiReason,
  });
}

export async function getUserCommentStats(context: DbContext, userId: string) {
  return await CommentRepo.getUserCommentStats(context.db, userId);
}
