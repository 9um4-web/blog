"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { savePost } from "@/lib/actions/posts";
import { setPostTags } from "@/lib/actions/tags";
import { syncPostSeries } from "@/lib/actions/series";
import { buildTagTree, type TagTreeNode } from "@/lib/domain/tag-tree";
import { usePostPreview } from "@/components/admin/use-post-preview";
import { DirectiveAutocompleteTextarea } from "@/components/admin/directive-autocomplete-textarea";
import { ImageUploader } from "@/components/admin/image-uploader";
import { PostPreview } from "@/components/admin/post-preview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

/**
 * 프리뷰 열림 상태 유지용 쿠키. localStorage가 아니라 쿠키인 이유:
 * 서버 페이지가 초기값을 읽어 prop으로 내려줄 수 있어 hydration 불일치와
 * effect 내 setState(react-hooks lint 금지)가 모두 필요 없어진다.
 */
export const PREVIEW_COOKIE = "post_editor_preview";

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
  seriesList: { id: number; name: string }[];
  /** ::post{slug=...} / :postlink{slug=...} 자동완성용 전체 포스트 목록 */
  allPosts: { title: string; slug: string }[];
  initialTagIds: number[];
  initialSeriesIds: number[];
  /** 서버에서 PREVIEW_COOKIE를 읽은 값 — 프리뷰 기본 열림 여부 */
  initialPreviewOpen: boolean;
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
  initialTagIds,
  initialSeriesIds,
  initialPreviewOpen,
}: PostEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [contentMd, setContentMd] = useState(post?.contentMd ?? "");
  const [summary, setSummary] = useState(post?.summary ?? "");
  const [unlisted, setUnlisted] = useState(post?.unlisted ?? false);
  const [previewOpen, setPreviewOpen] = useState(initialPreviewOpen);
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

  // previewOpen이 true가 되는 시점(마운트 포함)에 첫 렌더를 예약
  useEffect(() => {
    if (previewOpen) schedulePreview(contentRef.current);
  }, [previewOpen, schedulePreview]);

  const togglePreview = () => {
    const next = !previewOpen;
    setPreviewOpen(next); // 열릴 때의 렌더 예약은 위 effect가 담당
    document.cookie = `${PREVIEW_COOKIE}=${next ? "on" : "off"}; path=/admin; max-age=31536000; samesite=lax`;
  };

  const onContentChange = (value: string) => {
    setContentMd(value);
    contentRef.current = value;
    if (previewOpen) schedulePreview(value);
  };

  // 에디터↔프리뷰 비례 스크롤 동기화. scrollTop 대입이 상대 패널의 scroll
  // 이벤트를 다시 발생시키므로, 값이 실제로 바뀔 때만 echo 플래그를 세워
  // 되돌아온 이벤트 1회를 삼킨다.
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const scrollEcho = useRef(false);
  const syncScroll = (from: HTMLElement, to: HTMLElement) => {
    if (scrollEcho.current) {
      scrollEcho.current = false;
      return;
    }
    const fromMax = from.scrollHeight - from.clientHeight;
    const ratio = fromMax > 0 ? from.scrollTop / fromMax : 0;
    const next = ratio * (to.scrollHeight - to.clientHeight);
    if (Math.abs(to.scrollTop - next) > 1) {
      scrollEcho.current = true;
      to.scrollTop = next;
    }
  };

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
            <Button
              type="button"
              variant={previewOpen ? "default" : "outline"}
              size="sm"
              onClick={togglePreview}
            >
              {previewOpen ? "미리보기 끄기" : "미리보기"}
            </Button>
            <ImageUploader
              onUploaded={(markdown) => {
                // 커서 위치에 삽입, 포커스가 없었다면 끝에 덧붙임
                const textarea = document.getElementById("content") as HTMLTextAreaElement | null;
                const start = textarea?.selectionStart ?? contentMd.length;
                const end = textarea?.selectionEnd ?? start;
                onContentChange(contentMd.slice(0, start) + markdown + contentMd.slice(end));
              }}
            />
          </div>
        </div>
        <div className={previewOpen ? "grid gap-4 lg:grid-cols-2" : ""}>
          <DirectiveAutocompleteTextarea
            id="content"
            value={contentMd}
            onValueChange={onContentChange}
            posts={allPosts}
            series={seriesList}
            // 프리뷰 열림: 고정 높이 + 내부 스크롤(스크롤 동기화 대상)
            // 프리뷰 닫힘: 기존처럼 내용 따라 자라는 textarea
            className={
              previewOpen
                ? `${PANE_HEIGHT_CLASS} resize-none overflow-auto font-mono text-sm`
                : "min-h-[24rem] font-mono text-sm"
            }
            onScroll={(e) => {
              if (previewPaneRef.current) syncScroll(e.currentTarget, previewPaneRef.current);
            }}
          />
          {previewOpen && (
            <div
              ref={previewPaneRef}
              onScroll={(e) => {
                const editor = document.getElementById("content");
                if (editor) syncScroll(e.currentTarget, editor);
              }}
              className={`${PANE_HEIGHT_CLASS} overflow-auto rounded-md border p-4`}
            >
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>미리보기 (제목/목차 제외, 접기·다이어그램 동작)</span>
                {previewLoading && <span>렌더 중…</span>}
              </div>
              {previewBodyParts.length > 0 ? (
                <PostPreview bodyParts={previewBodyParts} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  본문을 입력하면 미리보기가 표시됩니다.
                </p>
              )}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          확장 문법: <code>```mermaid</code> · <code>::youtube[영상ID]</code> ·{" "}
          <code>::post{"{slug=my-post}"}</code> · <code>::series{"{id=1}"}</code> ·{" "}
          <code>:postlink[표시할 텍스트]{"{slug=my-post}"}</code>(문장 안에 다른 글로
          가는 링크, 텍스트는 자유롭게) · <code>:::note[제목]</code>…<code>:::</code>{" "}
          콜아웃(note/info/tip/warning/danger) · <code>$수식$</code>/
          <code>$$블록수식$$</code> · <code>[^1]</code> 각주(본문 아무 곳에{" "}
          <code>[^1]: 각주 내용</code>을 따로 적어두면 문서 끝에 모임) ·{" "}
          <code>:::center</code>·<code>:::right</code> 정렬 ·{" "}
          <code>:::indent{"{n=2}"}</code> 들여쓰기 · <code>:::fold{"{h=2}"}</code>{" "}
          섹션 소속 지정(<code>h=none</code>이면 안 접힘). <code>:::</code> 컨테이너는
          반드시 닫는 <code>:::</code>가 있어야 합니다.
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
