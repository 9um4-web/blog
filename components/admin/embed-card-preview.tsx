"use client";

// 시각 편집기에서 `::post{slug=…}` / `::series{id=…}` 원문 상자 아래에 보이는 카드 미리보기.
// 공개 페이지와 같은 카드 부품을 쓰되, 편집 중에 페이지가 넘어가지 않도록 링크는 걸지 않는다.
import { useEffect, useState } from "react";
import { PostCardContent } from "@/components/post/post-card-content";
import { SeriesCardHeading, SeriesCardPosts } from "@/components/post/series-card-parts";
import { loadEmbedCard } from "@/lib/actions/posts";
import type { EmbedLine, PostEmbedPostCard, PostEmbedSeriesCard } from "@/lib/post-embeds";

type Card = PostEmbedPostCard | PostEmbedSeriesCard | null;

const cache = new Map<string, Promise<Card>>();

function cacheKey(embed: EmbedLine): string {
  return embed.kind === "post" ? `post:${embed.slug}` : `series:${embed.id}`;
}

/** 같은 임베드는 한 번만 읽는다(글자를 칠 때마다 다시 그려져도 서버를 다시 부르지 않게). 실패는 캐시하지 않는다. */
function fetchCard(embed: EmbedLine): Promise<Card> {
  const key = cacheKey(embed);
  let pending = cache.get(key);
  if (pending === undefined) {
    pending = loadEmbedCard(embed.kind === "post" ? { kind: "post", slug: embed.slug } : { kind: "series", id: embed.id });
    pending.catch(() => cache.delete(key));
    cache.set(key, pending);
  }
  return pending;
}

type State = { status: "loading" } | { status: "error" } | { status: "done"; card: Card };

export function EmbedCardPreview({ embed }: { embed: EmbedLine }) {
  const key = cacheKey(embed);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    // 원문이 바뀌면 위젯 자체가 새로 만들어지므로(데코레이션 key) 여기서 상태를 되돌릴 필요는 없다.
    let alive = true;
    fetchCard(embed).then(
      (card) => alive && setState({ status: "done", card }),
      () => alive && setState({ status: "error" }),
    );
    return () => {
      alive = false;
    };
    // embed는 key로 대신한다(같은 값이면 다시 읽지 않는다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const label = embed.kind === "post" ? `포스트 ${embed.slug}` : `시리즈 ${embed.id}`;
  if (state.status === "loading") return <p className="text-sm text-neutral-500">불러오는 중… ({label})</p>;
  if (state.status === "error") return <p className="text-sm text-red-600">카드를 불러오지 못했습니다. ({label})</p>;
  if (state.card === null) return <p className="text-sm text-red-600">찾을 수 없는 {embed.kind === "post" ? "포스트" : "시리즈"}입니다. ({label})</p>;

  if (embed.kind === "post") {
    const card = state.card as PostEmbedPostCard;
    return (
      <div className="rounded-lg border p-4">
        <PostCardContent title={card.title} summary={card.summary} />
      </div>
    );
  }
  const series = state.card as PostEmbedSeriesCard;
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
