"use client";

// 시각 편집기의 `![[슬러그]]` / `![[series/슬러그]]` 참조 카드 아래에 보이는 미리보기.
// 공개 페이지와 같은 카드 부품을 쓰되, 편집 중에 페이지가 넘어가지 않도록 링크는 걸지 않는다.
import { PostCardContent } from "@/components/post/post-card-content";
import { SeriesCardHeading, SeriesCardPosts } from "@/components/post/series-card-parts";
import { loadEmbedCard } from "@/lib/actions/posts";
import type { EmbedLine, PostEmbedPostCard, PostEmbedSeriesCard } from "@/lib/post-embeds";

export type EmbedCard = PostEmbedPostCard | PostEmbedSeriesCard | null;

const cache = new Map<string, Promise<EmbedCard>>();

/** 같은 임베드는 한 번만 읽는다(카드가 다시 그려져도 서버를 다시 부르지 않게). 실패는 캐시하지 않는다. */
export function fetchEmbedCard(embed: EmbedLine): Promise<EmbedCard> {
  const key = `${embed.kind}:${embed.slug}`;
  let pending = cache.get(key);
  if (pending === undefined) {
    pending = loadEmbedCard(embed);
    pending.catch(() => cache.delete(key));
    cache.set(key, pending);
  }
  return pending;
}

/** 읽어 온 카드의 모양(제목·요약, 시리즈는 접이식 글 목록). */
export function EmbedCardBody({ kind, card }: { kind: EmbedLine["kind"]; card: PostEmbedPostCard | PostEmbedSeriesCard }) {
  if (kind === "post") {
    const post = card as PostEmbedPostCard;
    return (
      <div className="rounded-lg border p-4">
        <PostCardContent title={post.title} summary={post.summary} />
      </div>
    );
  }
  const series = card as PostEmbedSeriesCard;
  return (
    <details className="rounded-lg border px-4 py-3">
      <summary className="cursor-pointer">
        <SeriesCardHeading name={series.name} isCompleted={series.isCompleted} count={series.posts.length} description={series.description} />
      </summary>
      <div className="mt-3">
        <SeriesCardPosts posts={series.posts} linkMode="anchor" linkClassName="pointer-events-none" />
      </div>
    </details>
  );
}
