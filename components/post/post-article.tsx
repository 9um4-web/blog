import "katex/dist/katex.min.css";
import { getSiteSettings, listSeriesOfPost, listTagsOfPost } from "@/lib/db/queries";
import type { posts } from "@/lib/db/schema";
import { renderPostHtml } from "@/lib/domain/render";
import { PostView } from "./post-view";

const dateFmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" });

export async function PostArticle({ post }: { post: typeof posts.$inferSelect }) {
  const [html, seriesList, tagList, config] = await Promise.all([
    renderPostHtml(post.contentMd),
    listSeriesOfPost(post.id),
    listTagsOfPost(post.id),
    getSiteSettings(),
  ]);

  // 자동 발췌가 아니라 명시적으로 입력한 요약만 노출 (설정으로 on/off)
  const summary =
    config.showSummaryOnPost && post.summary?.trim() ? post.summary.trim() : null;

  return (
    <article>
      <PostView
        html={html}
        headingTree={post.headingTree ?? []}
        title={post.title}
        updatedLabel={dateFmt.format(post.updatedAt)}
        updatedIso={post.updatedAt.toISOString()}
        series={seriesList.map((s) => ({
          seriesId: s.seriesId,
          name: s.name,
          isCompleted: s.isCompleted,
        }))}
        summary={summary}
        tags={tagList}
      />
    </article>
  );
}
