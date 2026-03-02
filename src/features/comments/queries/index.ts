import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import {
  getMyCommentsFn,
  getRepliesByRootIdFn,
  getRootCommentsByPostIdFn,
} from "../api/comments.public.api";
import { getAllCommentsFn } from "../api/comments.admin.api";
import type { CommentStatus } from "@/lib/db/schema";

export const COMMENTS_KEYS = {
  all: ["comments"] as const,

  // Parent keys (static arrays for prefix invalidation)
  mine: ["comments", "mine"] as const,
  admin: ["comments", "admin"] as const,

  // Child keys (functions for specific queries)
  roots: (postId?: number, guitarTabId?: number) =>
    ["comments", "roots", { postId, guitarTabId }] as const,
  replies: (postId?: number, guitarTabId?: number, rootId?: number) =>
    ["comments", "replies", { postId, guitarTabId }, rootId] as const,
  repliesLists: (postId?: number, guitarTabId?: number) =>
    ["comments", "replies", { postId, guitarTabId }] as const,
  userStats: (userId: string) =>
    ["comments", "admin", "user-stats", userId] as const,
};

export function rootCommentsByPostIdQuery(
  postId?: number,
  userId?: string,
  guitarTabId?: number,
) {
  return queryOptions({
    queryKey: [...COMMENTS_KEYS.roots(postId, guitarTabId), { userId }],
    queryFn: () =>
      getRootCommentsByPostIdFn({ data: { postId, guitarTabId } }),
  });
}

export function rootCommentsByPostIdInfiniteQuery(
  postId?: number,
  userId?: string,
  guitarTabId?: number,
) {
  return infiniteQueryOptions({
    queryKey: [
      ...COMMENTS_KEYS.roots(postId, guitarTabId),
      "infinite",
      { userId },
    ],
    queryFn: ({ pageParam = 0 }) =>
      getRootCommentsByPostIdFn({
        data: { postId, guitarTabId, offset: pageParam, limit: 20 },
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const totalLoaded = allPages.reduce(
        (sum, page) => sum + page.items.length,
        0,
      );
      return totalLoaded < lastPage.total ? totalLoaded : undefined;
    },
  });
}

export function repliesByRootIdInfiniteQuery(
  postId: number | undefined,
  rootId: number,
  userId?: string,
  guitarTabId?: number,
) {
  return infiniteQueryOptions({
    queryKey: [
      ...COMMENTS_KEYS.replies(postId, guitarTabId, rootId),
      { userId },
    ],
    queryFn: ({ pageParam = 0 }) =>
      getRepliesByRootIdFn({
        data: { postId, guitarTabId, rootId, offset: pageParam, limit: 20 },
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const totalLoaded = allPages.reduce(
        (sum, page) => sum + page.items.length,
        0,
      );
      return totalLoaded < lastPage.total ? totalLoaded : undefined;
    },
  });
}

export function myCommentsQuery(
  options: {
    offset?: number;
    limit?: number;
    status?: CommentStatus;
  } = {},
) {
  return queryOptions({
    queryKey: [...COMMENTS_KEYS.mine, options],
    queryFn: () => getMyCommentsFn({ data: options }),
  });
}

export function allCommentsQuery(
  options: {
    offset?: number;
    limit?: number;
    status?: CommentStatus;
    postId?: number;
    userId?: string;
    userName?: string;
  } = {},
) {
  return queryOptions({
    queryKey: [...COMMENTS_KEYS.admin, options],
    queryFn: () => getAllCommentsFn({ data: options }),
  });
}
