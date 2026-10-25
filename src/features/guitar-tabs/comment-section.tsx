import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Turnstile, useTurnstile } from "@/components/common/turnstile";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";
import { orpc, orpcClient } from "@/lib/orpc";

export function CommentSection({ guitarTabId }: { guitarTabId: number }) {
  const queryClient = useQueryClient();
  const query = orpc.guitarComments.list.queryOptions({
    input: { guitarTabId },
  });
  const { data: comments = [], isPending, isError } = useQuery(query);
  const { data: session } = authClient.useSession();
  const [content, setContent] = useState("");
  const turnstile = useTurnstile("guitar-comment");
  const [reply, setReply] = useState<{ id: number; name: string } | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: query.queryKey });
  const create = useMutation({
    onSettled: turnstile.reset,
    mutationFn: () =>
      orpcClient.guitarComments.create({
        guitarTabId,
        content,
        replyToCommentId: reply?.id,
      }),
    onSuccess: () => {
      setContent("");
      setReply(null);
      void refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) =>
      orpcClient.guitarComments.remove({ guitarTabId, id }),
    onSuccess: () => {
      void refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <section className="fuwari-card-base p-6 mt-8" aria-label="吉他谱评论">
      <h2 className="text-lg font-medium mb-4">评论</h2>
      {isPending && <p role="status">正在加载评论…</p>}
      {isError && <p role="alert">评论加载失败，请稍后刷新。</p>}
      {comments.map((comment) => (
        <article
          key={comment.id}
          id={`guitar-comment-${comment.id}`}
          className={`py-4 border-b border-border ${comment.rootId ? "ml-6" : ""}`}
        >
          <div className="text-sm text-muted-foreground">
            {comment.userName || "访客"} ·{" "}
            {new Date(comment.createdAt).toLocaleDateString("zh-CN")}
          </div>
          <p className="whitespace-pre-wrap break-words my-2">
            {comment.content}
          </p>
          {session && comment.userId && (
            <div className="flex gap-3 text-sm">
              <button
                type="button"
                onClick={() =>
                  setReply({ id: comment.id, name: comment.userName || "访客" })
                }
              >
                回复
              </button>
              {(session.user.id === comment.userId ||
                session.user.role === "admin") && (
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(comment.id)}
                >
                  删除
                </button>
              )}
            </div>
          )}
        </article>
      ))}
      {session ? (
        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          {reply && (
            <p className="text-sm">
              回复 {reply.name}{" "}
              <button type="button" onClick={() => setReply(null)}>
                取消
              </button>
            </p>
          )}
          <textarea
            aria-label="评论内容"
            className="w-full min-h-28 rounded-lg border border-border bg-background p-3"
            maxLength={4000}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            required
          />
          <Turnstile {...turnstile.turnstileProps} />
          <Button
            type="submit"
            disabled={
              create.isPending || turnstile.isPending || !content.trim()
            }
          >
            发表评论
          </Button>
        </form>
      ) : (
        <p className="mt-4">
          <Link to="/login">登录后发表评论</Link>
        </p>
      )}
    </section>
  );
}
