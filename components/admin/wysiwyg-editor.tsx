"use client";

// 관리자 본문 편집기의 WYSIWYG 모드. 원본은 항상 마크다운(`contentMd`)이고, 이 컴포넌트는 그것을 열어 고치고 마크다운으로 돌려준다.
// 에디터는 @gogum4/editor-* 패키지다. 문법은 Obsidian 호환(콜아웃 `> [!종류]`, 임베드 `![](주소)`, 글 카드 `![[슬러그]]`, 들여쓰기 `&emsp;`)이고,
// 에디터가 구조를 모르는 것(이미지·HTML·열 정렬 표)은 회색 상자/칸의 **원문 그대로** 보존된다 — 열기만 하고 고치지 않으면 본문은 바뀌지 않는다.
import "@gogum4/editor-react/styles.css";

import { memoryPorts, type ReferenceResolver } from "@gogum4/editor-core";
import { createReactExtensions, EditorPortsProvider, FootnoteEditorHost, MathEditorHost, SelectionToolbar, TableToolbar } from "@gogum4/editor-react";
import { BLOG_EXTRAS } from "@/lib/domain/extras";
import { markdownToDoc } from "@gogum4/editor-markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";

import type { EmbedLine, PostEmbedPostCard, PostEmbedSeriesCard } from "@/lib/post-embeds";
import { exportMarkdown, IMPORT_CONTEXT, parseBlogEmbedInput } from "@/lib/wysiwyg-markdown";
import { resolveBlueskyDid } from "@/lib/domain/bluesky";
import { PostLink } from "./post-link-extension";
import { EmbedCardBody, fetchEmbedCard } from "./embed-card-preview";

export interface WysiwygEditorHandle {
  /** 커서 위치에 마크다운 조각을 끼운다(이미지 업로드 결과 등). */
  insertMarkdown(markdown: string): void;
}

interface WysiwygEditorProps {
  /** 처음 열 때의 마크다운. 이후의 변경은 `onContentChange`로 나가고, 이 값이 바뀌어도 에디터는 다시 열리지 않는다(모드를 바꿔 다시 열 때 새로 읽는다). */
  initialMarkdown: string;
  onContentChange: (markdown: string) => void;
}

/** 입력이 멈춘 뒤 이만큼 기다렸다가 마크다운으로 내보낸다(글자마다 문서 전체를 변환하지 않게). */
const EXPORT_DELAY_MS = 250;

/** 글·시리즈 카드(`reference` 노드)의 종류 이름. 마크다운에서는 `![[슬러그]]`, `![[series/슬러그]]`. */
const REFERENCE_KINDS = ["post", "series"] as const;

/** 블로그에 없는 기능의 `/` 항목은 뺀다(이미지는 업로드 버튼, 토글·양쪽 정렬은 블로그 문법에 없다). */
const HIDDEN_SLASH_ITEMS = new Set(["image", "toggle", "alignJustify"]);

function referenceResolver(kind: EmbedLine["kind"]): ReferenceResolver {
  return {
    async resolve(id) {
      const card = await fetchEmbedCard({ kind, slug: id });
      if (card === null) return null;
      return kind === "post"
        ? { title: (card as PostEmbedPostCard).title, description: (card as PostEmbedPostCard).summary, preview: card }
        : { title: (card as PostEmbedSeriesCard).name, description: (card as PostEmbedSeriesCard).description ?? undefined, preview: card };
    },
    open(id) {
      window.open(kind === "post" ? `/${id}` : `/series/${id}`, "_blank", "noopener,noreferrer");
    },
    renderPreview(info, container) {
      const root = createRoot(container);
      root.render(<EmbedCardBody kind={kind} card={info.preview as PostEmbedPostCard | PostEmbedSeriesCard} />);
      // 렌더 도중에 unmount하면 React가 경고하므로 한 박자 늦춘다.
      return () => queueMicrotask(() => root.unmount());
    },
  };
}

export const WysiwygEditor = forwardRef<WysiwygEditorHandle, WysiwygEditorProps>(function WysiwygEditor({ initialMarkdown, onContentChange }, ref) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 마지막으로 내보냈거나 처음 열었을 때의 마크다운. 에디터가 스스로 일으키는 변경(블록 id 부여 등)은 마크다운이 같으므로 내보내지 않는다.
  const lastMarkdown = useRef<string | null>(null);
  const onChangeRef = useRef(onContentChange);
  useEffect(() => {
    onChangeRef.current = onContentChange;
  }, [onContentChange]);

  const ports = useMemo(
    () =>
      memoryPorts({
        links: {
          open: async (url) => {
            window.open(url, "_blank", "noopener,noreferrer");
          },
        },
        references: Object.fromEntries(REFERENCE_KINDS.map((kind) => [kind, referenceResolver(kind)])),
        parseEmbedInput: (input) => parseBlogEmbedInput(input, window.location.origin),
        // 핸들 주소의 Bluesky 임베드는 DID를 알아내야 그려진다(공개 API, 결과는 캐시).
        resolveBlueskyHandle: resolveBlueskyDid,
      }),
    [],
  );

  const extensions = useMemo(
    () =>
      createReactExtensions(null, {
        ports,
        raw: true,
        reference: true,
        embed: true,
        indent: true,
        extras: BLOG_EXTRAS,
        // 열자마자 문서 정리를 끝낸다(원문 상자·인라인 원자 노드를 처음 누를 때의 선택 오류 방지). 변경 여부는 내보낸 마크다운을 기준과 비교해 가린다.
        settle: true,
        markdown: IMPORT_CONTEXT,
        // 이미지는 블로그 업로드(`![](/img/…)`)로만 넣고 에디터의 이미지 노드(앱 저장소 해시)는 쓰지 않는다. 토글도 블로그 문법에 없다.
        transform: (list) => [...list.filter((extension) => extension.name !== "image" && extension.name !== "toggle"), PostLink],
        slashItems: (core) => [
          ...core.filter((item) => !HIDDEN_SLASH_ITEMS.has(item.id)),
          { id: "blog-postlink", label: "글 링크", description: "[[슬러그|텍스트]] — 문장 안에서 다른 글로 가는 링크", keywords: ["postlink", "wikilink", "link", "글", "링크", "포스트"] },
        ],
        slashHandlers: {
          "blog-postlink": (_editor, chain) => {
            const slug = window.prompt("연결할 글의 슬러그 (예: my-post)")?.trim().toLowerCase();
            return slug ? chain.insertContent({ type: "pageLink", attrs: { pageId: slug } }).run() : false;
          },
        },
      }),
    [ports],
  );

  const editor = useEditor({
    extensions,
    // 마운트할 때만 읽는다. 읽는 것만으로는 `onUpdate`가 불리지 않으므로 열기만 해서는 본문이 바뀌지 않는다.
    content: markdownToDoc(initialMarkdown, IMPORT_CONTEXT, "").doc,
    immediatelyRender: false,
    editorProps: { attributes: { class: "md-editor", "aria-label": "본문" } },
    onCreate: ({ editor: current }) => {
      lastMarkdown.current = exportMarkdown(current.getJSON());
    },
    onUpdate: ({ editor: current }) => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        const markdown = exportMarkdown(current.getJSON());
        if (markdown === lastMarkdown.current) return;
        lastMarkdown.current = markdown;
        onChangeRef.current(markdown);
      }, EXPORT_DELAY_MS);
    },
  });

  // 모드를 바꾸거나 저장하러 떠날 때 아직 내보내지 않은 마지막 입력을 잃지 않게 바로 내보낸다.
  useEffect(
    () => () => {
      if (timer.current === null || editor === null || editor.isDestroyed) return;
      clearTimeout(timer.current);
      timer.current = null;
      const markdown = exportMarkdown(editor.getJSON());
      if (markdown === lastMarkdown.current) return;
      lastMarkdown.current = markdown;
      onChangeRef.current(markdown);
    },
    [editor],
  );

  useImperativeHandle(
    ref,
    () => ({
      insertMarkdown: (markdown) => {
        if (editor === null) return;
        const { doc } = markdownToDoc(markdown, IMPORT_CONTEXT, "");
        editor.chain().focus().insertContent(doc.content ?? []).run();
      },
    }),
    [editor],
  );

  return (
    <EditorPortsProvider ports={ports}>
      {/* 블로그는 어두운 테마가 있고 에디터 스타일은 밝은 배경 기준이라 항상 밝은 종이 위에 둔다. typography(prose)와 겹치지 않게 not-prose. */}
      <div className="not-prose min-h-[24rem] rounded-md border bg-white p-4 text-neutral-900">
        <EditorContent editor={editor} />
        <TableToolbar editor={editor} />
        <SelectionToolbar editor={editor} />
        <MathEditorHost />
        <FootnoteEditorHost />
      </div>
    </EditorPortsProvider>
  );
});
