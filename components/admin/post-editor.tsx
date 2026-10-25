"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { savePost } from "@/lib/actions/posts";
import { setPostTags } from "@/lib/actions/tags";
import { syncPostSeries } from "@/lib/actions/series";
import { EMBED_LINE, EMBED_MAX_PX, EMBED_MIN_PX, isEmbedUrl, isRatioEmbedUrl } from "@/lib/domain/embed-line";
import { buildTagTree, type TagTreeNode } from "@/lib/domain/tag-tree";
import { usePostPreview } from "@/components/admin/use-post-preview";
import { DirectiveAutocompleteTextarea } from "@/components/admin/directive-autocomplete-textarea";
import { ImageUploader } from "@/components/admin/image-uploader";
import { PostPreview } from "@/components/admin/post-preview";
import { UnifiedEditor } from "@/components/admin/unified-editor";
import type { WysiwygEditorHandle } from "@/components/admin/wysiwyg-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { EDITOR_MODE_COOKIE, type EditorMode } from "@/lib/editor-utils";

const MODE_LABELS: Record<EditorMode, string> = {
  unified: "통합",
  split: "분할",
  source: "소스",
  wysiwyg: "시각",
};

// 시각(WYSIWYG) 모드는 에디터 번들(TipTap·KaTeX·mermaid 등)이 커서 그 모드를 열 때만 불러온다.
const WysiwygEditor = dynamic(() => import("@/components/admin/wysiwyg-editor").then((m) => m.WysiwygEditor), {
  ssr: false,
  loading: () => <p className="text-sm text-muted-foreground">에디터를 불러오는 중…</p>,
});

function persistEditorMode(mode: EditorMode) {
  document.cookie = `${EDITOR_MODE_COOKIE}=${mode}; path=/admin; max-age=31536000; samesite=lax`;
}

/** 통합 편집 모드에서 에디터/프리뷰 패널 공통 높이 (헤더·메타 영역 제외한 viewport) */
const PANE_HEIGHT_CLASS = "h-[calc(100vh-14rem)] min-h-[24rem]";

interface TagData {
  id: number;
  parentTagId: number | null;
  name: string;
  slug: string;
}

interface PostEditorProps {
  post: {
    id: number;
    title: string;
    slug: string | null;
    contentMd: string;
    summary: string | null;
    unlisted: boolean;
    parseError: string | null;
    parsedAt: Date | null;
  } | null;
  tags: TagData[];
  seriesList: { id: number; name: string; slug: string }[];
  /** ![[슬러그]] / [[슬러그]] 자동완성용 전체 포스트 목록 */
  allPosts: { title: string; slug: string }[];
  images: { id: number; filename: string; size: number; mimeType: string }[];
  initialTagIds: number[];
  initialSeriesIds: number[];
  /** 서버에서 EDITOR_MODE_COOKIE를 읽은 값 */
  initialMode: EditorMode;
}

function TagCheckboxTree({
  nodes,
  selected,
  onToggle,
}: {
  nodes: TagTreeNode<TagData>[];
  selected: Set<number>;
  onToggle: (id: number, checked: boolean) => void;
}) {
  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <li key={node.tag.id}>
          <label className={`flex items-center gap-2 text-sm ${node.tag.parentTagId === null ? "text-muted-foreground" : ""}`}>
            {node.tag.parentTagId !== null && (
              <Checkbox
                checked={selected.has(node.tag.id)}
                onCheckedChange={(v) => onToggle(node.tag.id, v === true)}
              />
            )}
            {node.tag.name}
          </label>
          {node.children.length > 0 && (
            <div className="ml-5 mt-1 border-l pl-3">
              <TagCheckboxTree nodes={node.children} selected={selected} onToggle={onToggle} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PostEditor({
  post,
  tags,
  seriesList,
  allPosts,
  images,
  initialTagIds,
  initialSeriesIds,
  initialMode,
}: PostEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [contentMd, setContentMd] = useState(post?.contentMd ?? "");
  const [summary, setSummary] = useState(post?.summary ?? "");
  const [unlisted, setUnlisted] = useState(post?.unlisted ?? false);
  const [mode, setMode] = useState<EditorMode>(initialMode);
  const [tagIds, setTagIds] = useState<Set<number>>(new Set(initialTagIds));
  const [seriesIds, setSeriesIds] = useState<Set<number>>(new Set(initialSeriesIds));
  const [parseError, setParseError] = useState(post?.parseError ?? null);
  const hadSuccessfulParse = post?.parsedAt != null;

  const onSave = () => {
    startTransition(async () => {
      const result = await savePost({
        id: post?.id,
        title,
        slug: slug.trim() === "" ? null : slug,
        contentMd,
        summary: summary.trim() === "" ? null : summary,
        unlisted,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const [tagResult, seriesResult] = [
        await setPostTags(result.id, [...tagIds]),
        await syncPostSeries(result.id, [...seriesIds]),
      ];
      if (!tagResult.ok) toast.error(`태그 저장 실패: ${tagResult.error}`);
      if (!seriesResult.ok) toast.error(`시리즈 저장 실패: ${seriesResult.error}`);

      setParseError(result.parseError);
      setSlug(result.slug);
      if (result.parseError) {
        toast.warning("저장은 되었지만 마크다운 파싱에 실패했습니다.");
      } else {
        toast.success("저장했습니다.");
      }

      if (post === null) {
        router.replace(`/admin/posts/${result.id}`);
      } else {
        router.refresh();
      }
    });
  };

  const {
    bodyParts: previewBodyParts,
    loading: previewLoading,
    schedule: schedulePreview,
  } = usePostPreview();

  // 최신 본문을 ref로도 유지 — 프리뷰가 (재)열릴 때 effect에서 렌더를 예약하는데,
  // contentMd를 deps에 넣으면 타이핑마다 effect가 돌므로 ref로 우회한다.
  // (ref 쓰기는 렌더 중이 아니라 이벤트/초기화 시점에만)
  const contentRef = useRef(post?.contentMd ?? "");
  const wysiwygRef = useRef<WysiwygEditorHandle>(null);

  // mode가 바뀔 때(마운트 포함) 프리뷰 렌더 예약
  useEffect(() => {
    if (mode === "unified" || mode === "split") {
      schedulePreview(contentRef.current);
    }
  }, [mode, schedulePreview]);

  const changeMode = (next: EditorMode) => {
    setMode(next);
    persistEditorMode(next);
  };

  const onContentChange = useCallback((value: string) => {
    setContentMd(value);
    contentRef.current = value;
    if (mode === "unified" || mode === "split") {
      schedulePreview(value);
    }
  }, [mode, schedulePreview]);

  const handleImageResize = useCallback(
    (
      lineNum: number,
      originalSrc: string,
      newSize: string,
      dimension: "width" | "height" = "width",
      currentWidthPx?: number,
    ) => {
      const newWidth = newSize;
      const lines = contentMd.split("\n");
      const targetLine = lines[lineNum - 1];
      if (!targetLine) return;

      let newLineText = targetLine;

      // 1. 임베드 한 줄(`![|500x300](주소)`) 리사이즈: 크기는 alt의 `|가로x세로`(px, 100~2000)로 적는다
      const embedLine = EMBED_LINE.exec(targetLine);
      if (embedLine !== null && isEmbedUrl(embedLine[3])) {
        const [, indent, alt, url] = embedLine;
        const size = /^\s*\|\s*(\d+)(?:x(\d+))?\s*$/.exec(alt);
        if (alt.trim() !== "" && size === null) return;
        const clamp = (value: number) => Math.min(Math.max(Math.round(value), EMBED_MIN_PX), EMBED_MAX_PX);
        let width = size ? Number(size[1]) : null;
        let height = size?.[2] !== undefined ? Number(size[2]) : null;
        if (dimension === "height") {
          // 높이만 끌면 가로가 없으므로, 지금 보이는 가로를 함께 적는다
          height = clamp(Number(newSize));
          width ??= clamp(currentWidthPx ?? 640);
        } else {
          width = clamp(Number(newWidth));
          // 비율을 유지해야 하는 영상(유튜브·비디오 파일)은 높이를 지운다 (SoundCloud 등은 높이를 유지)
          if (isRatioEmbedUrl(url)) height = null;
        }
        newLineText = `${indent}![|${width}${height !== null ? `x${height}` : ""}](${url})`;
      } else {
        // 2. 이미지 마크다운 리사이즈 처리 (기존 로직) — 이미지는 너비만 지원
        if (dimension === "height") return;
        let baseSrc = originalSrc;
        try {
          const url = new URL(originalSrc, "http://localhost");
          baseSrc = url.pathname;
        } catch {}

        const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
        let match;

        while ((match = imageRegex.exec(targetLine)) !== null) {
          const matchedAlt = match[1];
          const matchedUrl = match[2];
          let matchedBaseUrl = matchedUrl;
          try {
            const url = new URL(matchedUrl, "http://localhost");
            matchedBaseUrl = url.pathname;
          } catch {}

          if (matchedBaseUrl === baseSrc) {
            let newUrl = matchedUrl;
            try {
              const url = new URL(matchedUrl, "http://localhost");
              const isHash = url.hash.includes("w=") || url.hash.includes("width=");

              // Remove existing height parameters to maintain aspect ratio
              url.searchParams.delete("h");
              url.searchParams.delete("height");

              if (isHash) {
                const hashParams = new URLSearchParams(url.hash.slice(1));
                hashParams.delete("h");
                hashParams.delete("height");
                if (hashParams.has("w")) hashParams.set("w", newWidth);
                else hashParams.set("width", newWidth);
                url.hash = hashParams.toString();
              } else {
                if (url.searchParams.has("width")) url.searchParams.set("width", newWidth);
                else url.searchParams.set("w", newWidth);
              }
              newUrl = url.pathname + url.search + url.hash;
            } catch {
              newUrl = matchedBaseUrl + `?w=${newWidth}`;
            }

            const originalMatchText = match[0];
            const replacementText = `![${matchedAlt}](${newUrl})`;
            newLineText = targetLine.replace(originalMatchText, replacementText);
            break;
          }
        }
      }

      if (newLineText !== targetLine) {
        lines[lineNum - 1] = newLineText;
        const newContent = lines.join("\n");
        onContentChange(newContent);
      }
    },
    [contentMd, onContentChange],
  );




  return (
    <div className="space-y-6">
      {parseError && (
        <Alert variant="destructive">
          <AlertTitle>마크다운 파싱 실패</AlertTitle>
          <AlertDescription>
            {hadSuccessfulParse
              ? "본문은 저장되었지만 파싱에 실패해, 게시 뷰에는 마지막 정상 버전의 목차를 표시 중입니다."
              : "본문은 저장되었지만 파싱에 실패해, 목차가 생성되지 않았습니다."}
            <pre className="mt-2 whitespace-pre-wrap text-xs">{parseError}</pre>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">제목</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">슬러그 (비우면 제목 기반 자동 생성)</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="my-post-slug"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="summary">요약 (선택 — 비우면 목록에 본문 앞부분이 표시됩니다)</Label>
        <Textarea
          id="summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="min-h-[4rem] text-sm"
          placeholder="목록 카드에 보여줄 한두 문장"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={unlisted} onCheckedChange={(v) => setUnlisted(v === true)} />
        링크로만 접속 가능 (목록/검색/태그/시리즈/사이트맵/RSS에서 제외, 직접 링크로는 계속 접근 가능)
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="content">본문 (마크다운, 본문 헤딩은 h2부터)</Label>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border">
              {(Object.keys(MODE_LABELS) as EditorMode[]).map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={mode === m ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none first:rounded-l-md last:rounded-r-md"
                  onClick={() => changeMode(m)}
                >
                  {MODE_LABELS[m]}
                </Button>
              ))}
            </div>
            <ImageUploader
              onUploaded={(markdown) => {
                if (mode === "wysiwyg") {
                  wysiwygRef.current?.insertMarkdown(markdown);
                  return;
                }
                if (mode === "unified") {
                  // 통합 모드의 #content는 열려 있는 블록의 draft라 커서 삽입이
                  // 본문 좌표와 어긋난다 — 항상 문서 끝에 덧붙인다
                  const base = contentRef.current.replace(/\s*$/, "");
                  onContentChange(base === "" ? markdown : `${base}\n\n${markdown}`);
                  return;
                }
                // 커서 위치에 삽입, 포커스가 없었다면 끝에 덧붙임
                const textarea = document.getElementById("content") as HTMLTextAreaElement | null;
                const start = textarea?.selectionStart ?? contentMd.length;
                const end = textarea?.selectionEnd ?? start;
                onContentChange(contentMd.slice(0, start) + markdown + contentMd.slice(end));
              }}
            />
          </div>
        </div>

        {mode === "wysiwyg" ? (
          // 모드를 바꿔 들어올 때마다 현재 본문을 새로 읽는다(그 사이 다른 모드에서 고친 내용 반영). 열기만 해서는 본문이 바뀌지 않는다.
          <WysiwygEditor ref={wysiwygRef} initialMarkdown={contentMd} onContentChange={onContentChange} />
        ) : mode === "unified" ? (
          <UnifiedEditor
            contentMd={contentMd}
            bodyParts={previewBodyParts}
            loading={previewLoading}
            onContentChange={onContentChange}
            onImageResize={handleImageResize}
            posts={allPosts}
            series={seriesList}
            images={images}
          />
        ) : (
          <div className={mode === "split" ? "grid gap-4 lg:grid-cols-2" : ""}>
            <DirectiveAutocompleteTextarea
              id="content"
              value={contentMd}
              onValueChange={onContentChange}
              posts={allPosts}
              series={seriesList}
              images={images}
              // 분할: 고정 높이 + 내부 스크롤
              // 소스: 기존처럼 내용 따라 자라는 textarea
              className={
                mode === "split"
                  ? `${PANE_HEIGHT_CLASS} resize-none overflow-auto font-mono text-sm`
                  : "min-h-[24rem] font-mono text-sm"
              }
            />
            {mode === "split" && (
              <div
                className={`${PANE_HEIGHT_CLASS} overflow-auto rounded-md border p-4`}
              >
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>미리보기 (제목/목차 제외, 접기·다이어그램 동작)</span>
                  {previewLoading && <span>렌더 중…</span>}
                </div>
                {previewBodyParts.length > 0 ? (
                  <PostPreview bodyParts={previewBodyParts} onImageResize={handleImageResize} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    본문을 입력하면 미리보기가 표시됩니다.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          확장 문법(Obsidian 호환): <code>```mermaid</code> ·{" "}
          <code>![](유튜브·X·Instagram·Pinterest·SoundCloud 주소)</code> 임베드(<code>![|500x300](주소)</code>로 크기,{" "}
          <code>.mp4</code> 주소는 비디오) · <code>![[my-post]]</code> 글 카드 · <code>![[series/my-series]]</code> 시리즈 카드 ·{" "}
          <code>[[my-post|표시할 텍스트]]</code>(문장 안에서 다른 글로 가는 링크) ·{" "}
          <code>{"> [!note] 제목"}</code> 콜아웃(<code>[!tip]</code>·<code>[!warning]</code>·<code>[!rocket]</code> …, 이름은 자유) ·{" "}
          <code>$수식$</code>/<code>$$블록수식$$</code> · <code>[^1]</code> 각주(본문 아무 곳에 <code>[^1]: 각주 내용</code>을 따로 적어두면 문서 끝에 모임) ·{" "}
          <code>{'<div align="center">'}</code>…<code>{"</div>"}</code> 정렬(위아래 빈 줄) ·{" "}
          <code>&amp;emsp;&amp;emsp;</code> 문단·제목 들여쓰기(두 개가 한 단계) ·{" "}
          <code>{'<div data-fold="2">'}</code>…<code>{"</div>"}</code> 섹션 소속 지정(<code>none</code>이면 안 접힘) ·{" "}
          이미지 크기 조절(<code>![설명](/url?w=300 또는 ?w=50% 또는 ?width=300&height=200)</code>).
        </p>
      </div>

      <Separator />

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="mb-3 font-semibold">태그</h3>
          {tags.filter(t => t.parentTagId === null).length === 0 && (
            <p className="text-sm text-muted-foreground">
              태그가 없습니다. 태그 관리에서 먼저 만들어 주세요.
            </p>
          )}
          <div className="space-y-4">
            {buildTagTree(tags).map((rootNode) => (
              <div key={rootNode.tag.id}>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">{rootNode.tag.name}</p>
                <TagCheckboxTree
                  nodes={rootNode.children}
                  selected={tagIds}
                  onToggle={(id, checked) =>
                    setTagIds((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(id);
                      else next.delete(id);
                      return next;
                    })
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-3 font-semibold">시리즈</h3>
          {seriesList.length === 0 && (
            <p className="text-sm text-muted-foreground">
              시리즈가 없습니다. 시리즈 관리에서 먼저 만들어 주세요.
            </p>
          )}
          <ul className="space-y-1">
            {seriesList.map((s) => (
              <li key={s.id}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={seriesIds.has(s.id)}
                    onCheckedChange={(v) =>
                      setSeriesIds((prev) => {
                        const next = new Set(prev);
                        if (v === true) next.add(s.id);
                        else next.delete(s.id);
                        return next;
                      })
                    }
                  />
                  {s.name}
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            새로 추가한 시리즈에서는 맨 뒤 순서로 들어갑니다. 순서 변경은 시리즈 관리에서.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={onSave} disabled={pending || title.trim() === ""}>
          {pending ? "저장 중…" : "저장"}
        </Button>
        {post?.slug && (
          <Button asChild variant="outline">
            <a href={`/${post.slug}`} target="_blank" rel="noreferrer">
              게시 뷰 보기
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
