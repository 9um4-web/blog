import "katex/dist/katex.min.css";
import {
  getSiteSettings,
  listPublicPostCardsBySlugs,
  listSeriesByIds,
  listSeriesOfPost,
  listSeriesPostsBySeriesIds,
  listTagsOfPost,
} from "@/lib/db/queries";
import type { posts } from "@/lib/db/schema";
import { renderPostHtml } from "@/lib/domain/render";
import { formatDate } from "@/lib/format-date";
import {
  extractPostEmbedRequests,
  hydratePostEmbedParts,
  splitPostEmbedParts,
} from "@/lib/post-embeds";
import { PostView } from "./post-view";

export async function PostArticle({ post }: { post: typeof posts.$inferSelect }) {
  const [html, seriesList, tagList, config] = await Promise.all([
    renderPostHtml(post.contentMd),
    listSeriesOfPost(post.id),
    listTagsOfPost(post.id),
    getSiteSettings(),
  ]);
  const embedParts = splitPostEmbedParts(html);
  const embedRequests = extractPostEmbedRequests(embedParts);
  const [embedPostCards, embedSeriesRows, embedSeriesPosts] = await Promise.all([
    listPublicPostCardsBySlugs(embedRequests.postSlugs),
    listSeriesByIds(embedRequests.seriesIds),
    listSeriesPostsBySeriesIds(embedRequests.seriesIds),
  ]);

  const seriesPostsMap = new Map<number, { postId: number; title: string; slug: string }[]>();
  for (const row of embedSeriesPosts) {
    if (row.slug === null) continue;
    const list = seriesPostsMap.get(row.seriesId);
    const item = { postId: row.postId, title: row.title, slug: row.slug };
    if (list) list.push(item);
    else seriesPostsMap.set(row.seriesId, [item]);
  }

  const bodyParts = hydratePostEmbedParts(embedParts, {
    postCards: embedPostCards,
    seriesCards: embedSeriesRows.map((series) => ({
      id: series.id,
      slug: series.slug,
      name: series.name,
      description: series.description,
      isCompleted: series.isCompleted,
      posts: seriesPostsMap.get(series.id) ?? [],
    })),
  });

  // 자동 발췌가 아니라 명시적으로 입력한 요약만 노출 (설정으로 on/off)
  const summary =
    config.showSummaryOnPost && post.summary?.trim() ? post.summary.trim() : null;

  return (
    <article>
      <PostView
        bodyParts={bodyParts}
        headingTree={post.headingTree ?? []}
        title={post.title}
        updatedLabel={formatDate(post.updatedAt, config.timeZone)}
        updatedIso={post.updatedAt.toISOString()}
        series={seriesList.map((s) => ({
          seriesId: s.seriesId,
          slug: s.slug,
          name: s.name,
          isCompleted: s.isCompleted,
        }))}
        summary={summary}
        tags={tagList}
        giscus={config.giscus}
      />
    </article>
  );
}
