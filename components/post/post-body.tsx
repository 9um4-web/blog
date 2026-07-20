"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import type { HydratedPostBodyPart } from "@/lib/post-embeds";
import { attachEmbedAutosize } from "./embed-autosize";
import { attachFootnotePreview } from "./footnote-preview";
import { renderVisibleMermaid } from "./mermaid-lazy";
import { PostCardContent } from "./post-card-content";
import { SeriesAccordionCard } from "./series-card-parts";

/**
 * 본문 컨테이너 공통 동작: mermaid lazy 렌더 + 각주 hover 미리보기.
 * PostView(게시 뷰) · PostPreview(에디터 분할 미리보기) · UnifiedEditor(통합 편집 뷰)가
 * 공유한다 — 셋 중 하나만 고치는 실수를 막기 위해 여기 한 곳에 둔다.
 */
export function usePostBodyEffects(bodyParts: HydratedPostBodyPart[]) {
  const bodyRef = useRef<HTMLDivElement>(null);

  const initMermaid = useCallback(() => {
    if (bodyRef.current) void renderVisibleMermaid(bodyRef.current);
  }, []);

  // 본문이 (재)렌더될 때마다 새로 삽입된 mermaid 블록 렌더
  useEffect(() => {
    initMermaid();
  }, [bodyParts, initMermaid]);

  useEffect(() => {
    if (!bodyRef.current) return;
    return attachFootnotePreview(bodyRef.current);
  }, [bodyParts]);

  // SNS embed iframe 높이를 실제 게시물 높이에 맞게 자동 조절
  useEffect(() => {
    if (!bodyRef.current) return;
    return attachEmbedAutosize(bodyRef.current);
  }, [bodyParts]);

  return { bodyRef, initMermaid };
}

/**
 * 헤딩 클릭 → 해당 섹션 접기/펼치기 (트리 구조 기준, 스펙 4.1).
 * :::indent 등 컨테이너 안에 중첩된 헤딩은 자기 섹션이 없어 heading이 section의
 * 직계 자식이 아니다 — 이 경우 엉뚱한 조상 섹션이 접히지 않도록 무시(null 반환).
 * "expanded"를 반환하면 호출자가 initMermaid를 다시 호출해야 한다 (스펙 4.2).
 */
export function toggleSectionAtHeading(
  target: HTMLElement,
  body: HTMLElement,
): "expanded" | "collapsed" | null {
  const heading = target.closest("h2, h3, h4, h5, h6");
  if (!heading || !body.contains(heading)) return null;
  const section = heading.closest("section[data-heading-id]");
  if (!section || heading.parentElement !== section) return null;

  if (section.hasAttribute("data-collapsed")) {
    section.removeAttribute("data-collapsed");
    return "expanded";
  }
  section.setAttribute("data-collapsed", "");
  return "collapsed";
}

/**
 * 하이드레이션된 본문 파트 렌더 루프 (html은 innerHTML, 임베드는 공용 카드).
 * withSourceAttrs=true면 카드/에러 파트 래퍼에 data-sl/el을 붙여 통합 편집 뷰의
 * "블록 클릭 → 원본 라인" 매핑이 html 파트의 블록과 동일한 경로로 동작하게 한다.
 */
export function BodyParts({
  parts,
  withSourceAttrs = false,
}: {
  parts: HydratedPostBodyPart[];
  withSourceAttrs?: boolean;
}) {
  const sourceAttrs = (part: HydratedPostBodyPart) =>
    withSourceAttrs && "sourceLines" in part && part.sourceLines
      ? { "data-sl": part.sourceLines.start, "data-el": part.sourceLines.end }
      : undefined;

  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "html") {
          return <div key={`html-${index}`} dangerouslySetInnerHTML={{ __html: part.html }} />;
        }
        if (part.kind === "error") {
          return (
            <p key={`error-${index}`} className="md-embed-error" {...sourceAttrs(part)}>
              {part.message}
            </p>
          );
        }
        if (part.kind === "post-card") {
          return (
            <div key={`post-${index}`} className="md-embed-card not-prose" {...sourceAttrs(part)}>
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
          <div key={`series-${index}`} className="md-embed-card not-prose" {...sourceAttrs(part)}>
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
    </>
  );
}
