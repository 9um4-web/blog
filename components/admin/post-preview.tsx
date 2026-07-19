"use client";

import "katex/dist/katex.min.css";
import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { attachFootnotePreview } from "@/components/post/footnote-preview";
import { renderVisibleMermaid } from "@/components/post/mermaid-lazy";
import { PostCardContent } from "@/components/post/post-card-content";
import { SeriesAccordionCard } from "@/components/post/series-card-parts";
import type { HydratedPostBodyPart } from "@/lib/post-embeds";

/**
 * 에디터 미리보기 본문. 게시 뷰(PostView)의 본문 렌더와 동일하게
 * 섹션 접기/펼치기 + Mermaid lazy 렌더를 지원한다. (TOC/제목은 생략)
 */
export function PostPreview({ bodyParts }: { bodyParts: HydratedPostBodyPart[] }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  const initMermaid = useCallback(() => {
    if (bodyRef.current) void renderVisibleMermaid(bodyRef.current);
  }, []);

  // 본문이 갱신될 때마다 새로 삽입된 mermaid 블록을 렌더
  useEffect(() => {
    initMermaid();
  }, [bodyParts, initMermaid]);

  useEffect(() => {
    if (!bodyRef.current) return;
    return attachFootnotePreview(bodyRef.current);
  }, [bodyParts]);

  const onBodyClick = useCallback(
    (e: React.MouseEvent) => {
      const heading = (e.target as HTMLElement).closest("h2, h3, h4, h5, h6");
      if (!heading || !bodyRef.current?.contains(heading)) return;
      const section = heading.closest("section[data-heading-id]");
      // :::indent 등 컨테이너 디렉티브 안에 중첩된 헤딩은 자기 섹션이 없어 heading이
      // section의 직계 자식이 아니다 — 이 경우 엉뚱한 조상 섹션이 접히지 않도록 무시
      if (!section || heading.parentElement !== section) return;
      if (section.hasAttribute("data-collapsed")) {
        section.removeAttribute("data-collapsed");
        initMermaid();
      } else {
        section.setAttribute("data-collapsed", "");
      }
    },
    [initMermaid],
  );

  return (
    <div
      ref={bodyRef}
      onClick={onBodyClick}
      className="post-body prose prose-neutral dark:prose-invert max-w-none"
    >
      {bodyParts.map((part, index) => {
        if (part.kind === "html") {
          return <div key={`html-${index}`} dangerouslySetInnerHTML={{ __html: part.html }} />;
        }
        if (part.kind === "error") {
          return (
            <p key={`error-${index}`} className="md-embed-error">
              {part.message}
            </p>
          );
        }
        if (part.kind === "post-card") {
          return (
            <div key={`post-${index}`} className="md-embed-card not-prose">
              <Link
                href={`/${part.card.slug}`}
                className="block rounded-lg border p-4 no-underline transition-colors hover:bg-accent/50"
              >
                <PostCardContent title={part.card.title} summary={part.card.summary} />
              </Link>
            </div>
          );
        }
        return (
          <div key={`series-${index}`} className="md-embed-card not-prose">
            <SeriesAccordionCard
              id={part.series.id}
              slug={part.series.slug}
              name={part.series.name}
              isCompleted={part.series.isCompleted}
              description={part.series.description}
              posts={part.series.posts}
            />
          </div>
        );
      })}
    </div>
  );
}
