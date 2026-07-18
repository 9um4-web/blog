"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Comments } from "@/components/comments";
import { Badge } from "@/components/ui/badge";
import type { HeadingNode } from "@/lib/domain/markdown";
import type { GiscusConfig } from "@/lib/db/queries";
import type { HydratedPostBodyPart } from "@/lib/post-embeds";
import { attachFootnotePreview } from "./footnote-preview";
import { PostCardContent } from "./post-card-content";
import { renderVisibleMermaid } from "./mermaid-lazy";
import { SeriesAccordionCard } from "./series-card-parts";
import { Toc } from "./toc";

interface PostViewProps {
  bodyParts: HydratedPostBodyPart[];
  headingTree: HeadingNode[];
  title: string;
  updatedLabel: string;
  updatedIso: string;
  series: { seriesId: number; name: string; slug: string; isCompleted: boolean }[];
  /** 서버에서 설정/존재 여부로 이미 걸러진 값. null이면 표시 안 함 */
  summary: string | null;
  tags: { id: number; name: string; slug: string }[];
  /** null이면 댓글 미설정 → 섹션 숨김 */
  giscus: GiscusConfig | null;
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

export function PostView({
  bodyParts,
  headingTree,
  title,
  updatedLabel,
  updatedIso,
  series,
  summary,
  tags,
  giscus,
}: PostViewProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [tagsOpen, setTagsOpen] = useState(true);

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

  // 각주 hover(데스크톱)/탭(모바일) 미리보기 팝오버
  useEffect(() => {
    if (!bodyRef.current) return;
    return attachFootnotePreview(bodyRef.current);
  }, [bodyParts]);

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
    <div className="mx-auto flex w-full max-w-5xl gap-8 px-4">
      {headingTree.length > 0 && (
        // 목차가 제목 상단부터 왼쪽 여백을 채운다
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pt-1">
            <Toc tree={headingTree} onNavigate={onTocNavigate} />
          </div>
        </aside>
      )}

      <div className="min-w-0 flex-1 pb-24">
        {/* 제목 섹션: 제목 / (시리즈 · 마지막 수정일) */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold">{title}</h1>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              {series.map((s) => (
                <Link key={s.seriesId} href={`/series/${s.slug}`}>
                  <Badge variant="secondary">
                    {s.name}
                    {s.isCompleted && " (완결)"}
                  </Badge>
                </Link>
              ))}
            </div>
            <time dateTime={updatedIso} className="ml-auto shrink-0">
              {updatedLabel}
            </time>
          </div>
        </header>

        {summary && (
          <p className="mb-8 rounded-lg border-l-4 bg-muted/40 px-4 py-3 text-[0.95rem] leading-relaxed text-muted-foreground">
            {summary}
          </p>
        )}

        <div
          ref={bodyRef}
          onClick={onBodyClick}
          // prose 기본 65ch 폭 제한을 풀어 가용 영역을 전부 사용
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

        {tags.length > 0 && (
          <section className="mt-12 border-t pt-4">
            <button
              type="button"
              onClick={() => setTagsOpen((v) => !v)}
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {tagsOpen ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
              태그 ({tags.length})
            </button>
            {tagsOpen && (
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Link key={tag.id} href={`/tag/${tag.slug}`}>
                    <Badge variant="outline" className="hover:bg-accent">
                      {tag.name}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {giscus && (
          <section className="mt-12 border-t pt-8">
            <Comments config={giscus} mapping={{ type: "pathname" }} />
          </section>
        )}
      </div>
    </div>
  );
}
