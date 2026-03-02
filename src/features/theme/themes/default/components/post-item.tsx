import { Link } from "@tanstack/react-router";
import { memo } from "react";
import type { PostItem as PostItemType } from "@/features/posts/posts.schema";
import { formatDate } from "@/lib/utils";

interface PostItemProps {
  post: PostItemType;
}

export const PostItem = memo(({ post }: PostItemProps) => {
  return (
    <div className="group">
      <Link
        to="/post/$slug"
        params={{ slug: post.slug }}
        className="block py-8 md:py-10 px-5 -mx-5 rounded-xl hover:bg-card hover:shadow-[0_4px_24px_-8px_hsl(var(--accent)/0.08),0_1px_6px_-2px_hsl(var(--foreground)/0.03)]"
        style={{
          transition: `all 450ms cubic-bezier(0.34, 1.3, 0.64, 1)`,
        }}
      >
        <div className="flex flex-col gap-3">
          {/* Metadata Row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-mono text-muted-foreground/60 tracking-wider">
            <time
              dateTime={post.publishedAt?.toISOString()}
              className="whitespace-nowrap"
            >
              {formatDate(post.publishedAt)}
            </time>
            {post.tags && post.tags.length > 0 && (
              <>
                <span className="opacity-30">/</span>
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="text-muted-foreground/60 whitespace-nowrap group-hover:text-accent transition-colors duration-[350ms] ease-[cubic-bezier(0.25,0.1,0.25,1)]"
                    >
                      #{tag.name}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <h3
            className="text-2xl md:text-3xl font-serif font-medium text-foreground group-hover:text-foreground/70"
            style={{
              viewTransitionName: `post-title-${post.slug}`,
              transition: `color 400ms cubic-bezier(0.25, 0.1, 0.25, 1), transform 450ms cubic-bezier(0.34, 1.3, 0.64, 1)`,
            }}
          >
            {post.title}
          </h3>

          <p
            className="text-muted-foreground font-light leading-relaxed max-w-2xl line-clamp-2 text-sm md:text-base font-sans mt-1 group-hover:text-muted-foreground/80"
            style={{
              transition: `color 400ms cubic-bezier(0.25, 0.1, 0.25, 1)`,
            }}
          >
            {post.summary}
          </p>
        </div>
      </Link>
    </div>
  );
});

PostItem.displayName = "PostItem";
