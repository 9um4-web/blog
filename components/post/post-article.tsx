import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listSeriesOfPost } from "@/lib/db/queries";
import type { posts } from "@/lib/db/schema";
import { renderPostHtml } from "@/lib/domain/render";
import { PostView } from "./post-view";

const dateFmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" });

export async function PostArticle({ post }: { post: typeof posts.$inferSelect }) {
  const [html, seriesList] = await Promise.all([
    renderPostHtml(post.contentMd),
    listSeriesOfPost(post.id),
  ]);

  return (
    <article>
      <header className="mx-auto mb-8 w-full max-w-6xl px-4">
        <h1 className="text-3xl font-bold">{post.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <time dateTime={post.createdAt.toISOString()}>
            {dateFmt.format(post.createdAt)}
          </time>
          {post.updatedAt.getTime() !== post.createdAt.getTime() && (
            <span>(수정: {dateFmt.format(post.updatedAt)})</span>
          )}
          {seriesList.map((s) => (
            <Link key={s.seriesId} href={`/series/${s.seriesId}`}>
              <Badge variant="secondary">
                {s.name}
                {s.isCompleted && " (완결)"}
              </Badge>
            </Link>
          ))}
        </div>
      </header>
      <PostView html={html} headingTree={post.headingTree ?? []} />
    </article>
  );
}
