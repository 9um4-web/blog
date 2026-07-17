"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { savePost } from "@/lib/actions/posts";
import { setPostTags } from "@/lib/actions/tags";
import { syncPostSeries } from "@/lib/actions/series";
import { buildTagTree, type TagTreeNode } from "@/lib/domain/tag-tree";
import { ImageUploader } from "@/components/admin/image-uploader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

interface TagData {
  id: number;
  namespaceId: number;
  parentTagId: number | null;
  name: string;
}

interface PostEditorProps {
  post: {
    id: number;
    title: string;
    slug: string | null;
    contentMd: string;
    summary: string | null;
    parseError: string | null;
    parsedAt: Date | null;
  } | null;
  namespaces: { id: number; name: string }[];
  tags: TagData[];
  seriesList: { id: number; name: string }[];
  initialTagIds: number[];
  initialSeriesIds: number[];
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
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.has(node.tag.id)}
              onCheckedChange={(v) => onToggle(node.tag.id, v === true)}
            />
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
  namespaces,
  tags,
  seriesList,
  initialTagIds,
  initialSeriesIds,
}: PostEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [contentMd, setContentMd] = useState(post?.contentMd ?? "");
  const [summary, setSummary] = useState(post?.summary ?? "");
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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="content">본문 (마크다운, 본문 헤딩은 h2부터)</Label>
          <ImageUploader
            onUploaded={(markdown) => {
              // 커서 위치에 삽입, 포커스가 없었다면 끝에 덧붙임
              const textarea = document.getElementById("content") as HTMLTextAreaElement | null;
              setContentMd((prev) => {
                if (!textarea) return `${prev}\n\n${markdown}\n`;
                const start = textarea.selectionStart ?? prev.length;
                const end = textarea.selectionEnd ?? start;
                return prev.slice(0, start) + markdown + prev.slice(end);
              });
            }}
          />
        </div>
        <Textarea
          id="content"
          value={contentMd}
          onChange={(e) => setContentMd(e.target.value)}
          className="min-h-[24rem] font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          확장 문법: <code>```mermaid</code> · <code>::youtube[영상ID]</code> ·{" "}
          <code>:::note[제목]</code>…<code>:::</code> 콜아웃(note/info/tip/warning/danger) ·{" "}
          <code>$수식$</code>/<code>$$블록수식$$</code> · <code>:::center</code>·
          <code>:::right</code> 정렬 · <code>:::indent{"{n=2}"}</code> 들여쓰기 ·{" "}
          <code>:::fold{"{h=2}"}</code> 섹션 소속 지정(<code>h=none</code>이면 안 접힘)
        </p>
      </div>

      <Separator />

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="mb-3 font-semibold">태그</h3>
          {namespaces.length === 0 && (
            <p className="text-sm text-muted-foreground">
              태그가 없습니다. 태그 관리에서 먼저 만들어 주세요.
            </p>
          )}
          <div className="space-y-4">
            {namespaces.map((ns) => {
              const tree = buildTagTree(tags.filter((t) => t.namespaceId === ns.id));
              if (tree.length === 0) return null;
              return (
                <div key={ns.id}>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">{ns.name}</p>
                  <TagCheckboxTree
                    nodes={tree}
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
              );
            })}
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
