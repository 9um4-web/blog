"use client";

import { useCallback, useEffect, useRef } from "react";
import type { HeadingNode } from "@/lib/domain/markdown";
import { renderVisibleMermaid } from "./mermaid-lazy";
import { Toc } from "./toc";

interface PostViewProps {
  html: string;
  headingTree: HeadingNode[];
}

/** headingTree에서 id의 조상 체인(id 제외)을 찾는다 */
function ancestorChain(tree: HeadingNode[], targetId: string): string[] | null {
  for (const node of tree) {
    if (node.id === targetId) return [];
    const inChild = ancestorChain(node.children, targetId);
    if (inChild !== null) return [node.id, ...inChild];
  }
  return null;
}

export function PostView({ html, headingTree }: PostViewProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  const initMermaid = useCallback(() => {
    if (bodyRef.current) void renderVisibleMermaid(bodyRef.current);
  }, []);

  // 최초 마운트: 펼쳐져 있는(=전부) 섹션의 mermaid 렌더.
  // URL 해시가 있으면 해당 위치로 스크롤.
  useEffect(() => {
    initMermaid();
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) document.getElementById(hash)?.scrollIntoView();
  }, [initMermaid]);

  // 본문 헤딩 클릭 → 해당 섹션 접기/펼치기 (트리 구조 기준, 스펙 4.1)
  const onBodyClick = useCallback(
    (e: React.MouseEvent) => {
      const heading = (e.target as HTMLElement).closest("h2, h3, h4, h5, h6");
      if (!heading || !bodyRef.current?.contains(heading)) return;
      const section = heading.closest("section[data-heading-id]");
      if (!section) return;

      if (section.hasAttribute("data-collapsed")) {
        section.removeAttribute("data-collapsed");
        // 펼쳐지는 시점에 내부 mermaid 최초 렌더 (스펙 4.2)
        initMermaid();
      } else {
        section.setAttribute("data-collapsed", "");
      }
    },
    [initMermaid],
  );

  // 목차 클릭: 조상 펼침 → mermaid 초기화 → 렌더 완료 후 스크롤 (순서 중요, 스펙 4.1)
  const onTocNavigate = useCallback(
    (id: string) => {
      const body = bodyRef.current;
      if (!body) return;

      const ancestors = ancestorChain(headingTree, id) ?? [];
      for (const ancestorId of ancestors) {
        body
          .querySelector(`section[data-heading-id="${CSS.escape(ancestorId)}"]`)
          ?.removeAttribute("data-collapsed");
      }
      initMermaid();

      // 펼침이 레이아웃에 반영된 다음 프레임에 스크롤해야 위치가 맞는다
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
          history.replaceState(null, "", `#${encodeURIComponent(id)}`);
        });
      });
    },
    [headingTree, initMermaid],
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-8 px-4">
      {headingTree.length > 0 && (
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <Toc tree={headingTree} onNavigate={onTocNavigate} />
          </div>
        </aside>
      )}
      <div
        ref={bodyRef}
        onClick={onBodyClick}
        // prose 기본 65ch 폭 제한을 풀어 가용 영역을 전부 사용
        className="post-body prose prose-neutral dark:prose-invert min-w-0 max-w-none flex-1 pb-24"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
