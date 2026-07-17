"use client";

import "katex/dist/katex.min.css";
import { useCallback, useEffect, useRef } from "react";
import { renderVisibleMermaid } from "@/components/post/mermaid-lazy";

/**
 * 에디터 미리보기 본문. 게시 뷰(PostView)의 본문 렌더와 동일하게
 * 섹션 접기/펼치기 + Mermaid lazy 렌더를 지원한다. (TOC/제목은 생략)
 */
export function PostPreview({ html }: { html: string }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  const initMermaid = useCallback(() => {
    if (bodyRef.current) void renderVisibleMermaid(bodyRef.current);
  }, []);

  // html이 갱신될 때마다 새로 삽입된 mermaid 블록을 렌더
  useEffect(() => {
    initMermaid();
  }, [html, initMermaid]);

  const onBodyClick = useCallback(
    (e: React.MouseEvent) => {
      const heading = (e.target as HTMLElement).closest("h2, h3, h4, h5, h6");
      if (!heading || !bodyRef.current?.contains(heading)) return;
      const section = heading.closest("section[data-heading-id]");
      if (!section) return;
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
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
