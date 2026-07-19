"use client";

import "katex/dist/katex.min.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HydratedPostBodyPart } from "@/lib/post-embeds";
import {
  BodyParts,
  toggleSectionAtHeading,
  usePostBodyEffects,
} from "@/components/post/post-body";
import { DirectiveAutocompleteTextarea } from "@/components/admin/directive-autocomplete-textarea";
import { Button } from "@/components/ui/button";

import { setupImageResizing } from "./image-resize";

interface PostOption {
  title: string;
  slug: string;
}

interface SeriesOption {
  id: number;
  name: string;
}

interface UnifiedEditorProps {
  contentMd: string;
  bodyParts: HydratedPostBodyPart[];
  loading: boolean;
  /** 블록 커밋으로 본문이 바뀔 때 호출 — 호출자가 재렌더(schedulePreview)까지 담당 */
  onContentChange: (value: string) => void;
  onImageResize?: (lineNum: number, originalSrc: string, newWidth: string) => void;
  posts: PostOption[];
  series: SeriesOption[];
}

/**
 * 편집 세션.
 * - block: 렌더된 블록 하나를 원본 라인 범위(start~end, 1-based 포함)로 편집.
 *   렌더 HTML은 React가 관여하지 않는 dangerouslySetInnerHTML 내부라, 블록 요소를
 *   display:none으로 숨기고 바로 뒤에 수동 생성한 div(mountEl)를 꽂아 포털로
 *   에디터를 그린다. 커밋/취소 시 원상복구.
 * - append: 문서 끝에 새 블록 추가 (React 트리에서 직접 렌더 — DOM 조작 불필요).
 */
type EditSession =
  | { kind: "block"; start: number; end: number; hiddenEl: HTMLElement; mountEl: HTMLElement }
  | { kind: "append" };

function InlineBlockEditor({
  draft,
  onDraftChange,
  posts,
  series,
  onCommit,
  onCancel,
}: {
  draft: string;
  onDraftChange: (v: string) => void;
  posts: PostOption[];
  series: SeriesOption[];
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      data-unified-editor-panel
      className="not-prose my-2 rounded-md border bg-background p-2 shadow-sm"
    >
      <DirectiveAutocompleteTextarea
        id="content"
        value={draft}
        onValueChange={onDraftChange}
        posts={posts}
        series={series}
        autoFocus
        className="min-h-[6rem] font-mono text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onCommit();
          } else if (e.key === "Escape") {
            // 자동완성 드롭다운이 열려 있으면 Textarea 내부에서 소비되어 여기 안 온다
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={onCommit}
      />
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>Ctrl+Enter·바깥 클릭 = 적용 / Esc = 취소</span>
        <div className="flex gap-1">
          {/* onMouseDown preventDefault: textarea blur(=커밋)보다 버튼 의도가 먼저 */}
          <Button
            size="sm"
            variant="ghost"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCancel}
          >
            취소
          </Button>
          <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={onCommit}>
            적용
          </Button>
        </div>
      </div>
    </div>
  );
}

export function UnifiedEditor({
  contentMd,
  bodyParts,
  loading,
  onContentChange,
  onImageResize,
  posts,
  series,
}: UnifiedEditorProps) {
  const { bodyRef, initMermaid } = usePostBodyEffects(bodyParts);
  const [session, setSession] = useState<EditSession | null>(null);
  const [draft, setDraft] = useState("");

  // 커밋 직후 ~ 새 렌더 도착 전에는 화면의 data-sl이 최신 본문과 어긋난다.
  // 그 사이의 블록 클릭은 무시한다 (재렌더는 보통 1초 미만).
  const staleRender = useRef(false);
  useEffect(() => {
    staleRender.current = false;
  }, [bodyParts]);

  // 이미지 드래그 리사이즈 핸들 부착 및 드래그 로직 처리
  useEffect(() => {
    if (bodyRef.current && onImageResize) {
      setupImageResizing(bodyRef.current, onImageResize);
    }
  }, [bodyParts, onImageResize, bodyRef]);

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const contentMdRef = useRef(contentMd);
  useEffect(() => {
    contentMdRef.current = contentMd;
  }, [contentMd]);

  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const restoreDom = useCallback((s: EditSession | null) => {
    if (s?.kind !== "block") return;
    s.mountEl.remove();
    s.hiddenEl.style.display = "";
  }, []);

  // 주의: setSession 업데이터 안에서 DOM 복구/onContentChange 같은 부수효과를 내면
  // StrictMode에서 두 번 실행된다 — 부수효과는 반드시 이벤트 핸들러 본문에서 수행.
  const closeSession = useCallback(() => {
    restoreDom(sessionRef.current);
    setSession(null);
  }, [restoreDom]);

  const commit = useCallback(() => {
    const currentSession = sessionRef.current;
    if (currentSession === null) return;
    restoreDom(currentSession);
    setSession(null);

    let next: string;
    const currentContent = contentMdRef.current;
    const currentDraft = draftRef.current;
    if (currentSession.kind === "append") {
      const base = currentContent.replace(/\s*$/, "");
      const addition = currentDraft.trim();
      if (addition === "") return;
      next = base === "" ? addition : `${base}\n\n${addition}`;
    } else {
      const lines = currentContent.split("\n");
      next = [
        ...lines.slice(0, currentSession.start - 1),
        ...(currentDraft === "" ? [] : currentDraft.split("\n")),
        ...lines.slice(currentSession.end),
      ].join("\n");
    }

    if (next !== currentContent) {
      staleRender.current = true;
      onContentChange(next);
    }
  }, [onContentChange, restoreDom]);

  const openBlock = useCallback((blockEl: HTMLElement) => {
    if (staleRender.current) return; // 방금 커밋한 내용 렌더 대기 중
    const start = Number(blockEl.dataset.sl);
    const end = Number(blockEl.dataset.el);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return;

    restoreDom(sessionRef.current);
    const mountEl = document.createElement("div");
    blockEl.insertAdjacentElement("afterend", mountEl);
    blockEl.style.display = "none";
    setSession({ kind: "block", start, end, hiddenEl: blockEl, mountEl });
    setDraft(contentMdRef.current.split("\n").slice(start - 1, end).join("\n"));
  }, [restoreDom]);

  const openAppend = useCallback(() => {
    if (staleRender.current) return;
    restoreDom(sessionRef.current);
    setSession({ kind: "append" });
    setDraft("");
  }, [restoreDom]);

  /**
   * capture 단계에서 가로채야 링크(next/link 포함)·카드 내부 버튼보다 먼저 처리된다.
   * - 에디터 패널 내부 클릭은 통과
   * - Alt+클릭 = 게시 뷰와 동일한 섹션 접기/펼치기
   * - 그 외 [data-sl] 블록 클릭 = 해당 블록 편집
   */
  const onBodyClickCapture = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-unified-editor-panel]")) return;
    if (
      target.closest(".image-resize-handle") ||
      document.body.dataset.imageResizing ||
      document.body.dataset.imageJustResized
    ) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (e.altKey) {
      if (bodyRef.current) {
        const result = toggleSectionAtHeading(target, bodyRef.current);
        if (result !== null) {
          e.preventDefault();
          e.stopPropagation();
          if (result === "expanded") initMermaid();
        }
      }
      return;
    }

    const blockEl = target.closest<HTMLElement>("[data-sl]");
    if (!blockEl || !bodyRef.current?.contains(blockEl)) {
      // 편집 대상이 아닌 곳 클릭이라도 링크 이동은 막는다 (편집 모드)
      if (target.closest("a")) e.preventDefault();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    openBlock(blockEl);
  }, [initMermaid, openBlock, bodyRef]);

  const bodyElement = useMemo(() => {
    return (
      <div
        ref={bodyRef}
        onClickCapture={onBodyClickCapture}
        className="post-body prose prose-neutral dark:prose-invert max-w-none [&_[data-sl]]:cursor-pointer [&_[data-sl]:hover]:bg-accent/30 [&_[data-sl]]:rounded-sm"
      >
        {bodyParts.length > 0 ? (
          <BodyParts parts={bodyParts} withSourceAttrs />
        ) : (
          <p className="text-sm text-muted-foreground">
            아직 내용이 없습니다. 아래에서 첫 블록을 추가하세요.
          </p>
        )}
      </div>
    );
  }, [bodyParts, onBodyClickCapture, bodyRef]);

  const editorPanel = (
    <InlineBlockEditor
      draft={draft}
      onDraftChange={setDraft}
      posts={posts}
      series={series}
      onCommit={commit}
      onCancel={closeSession}
    />
  );

  return (
    <div className="rounded-md border p-4">
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>블록 클릭 = 편집 · Alt+클릭 = 섹션 접기 · 각주 정의 등은 소스/분할 모드에서</span>
        {loading && <span>렌더 중…</span>}
      </div>

      {bodyElement}

      {session?.kind === "block" && createPortal(editorPanel, session.mountEl)}

      <div className="not-prose mt-4">
        {session?.kind === "append" ? (
          editorPanel
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={openAppend}>
            + 블록 추가
          </Button>
        )}
      </div>
    </div>
  );
}
