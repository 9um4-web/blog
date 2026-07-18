"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createTag,
  deleteTag,
  moveTag,
  renameTag,
  type ActionResult,
} from "@/lib/actions/tags";
import { buildTagTree, type TagTreeNode } from "@/lib/domain/tag-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

interface TagData {
  id: number;
  parentTagId: number | null;
  name: string;
  slug: string;
}

interface TagsManagerProps {
  tags: TagData[];
}

type EditState =
  | { kind: "rename-tag"; tagId: number }
  | { kind: "add-child"; parentId: number | null }
  | { kind: "move"; tagId: number }
  | null;

/** 트리에서 tagId 자신 + 자손 id 집합 (이동 대상 후보에서 제외용) */
function subtreeIds(nodes: TagTreeNode<TagData>[], tagId: number): Set<number> {
  const result = new Set<number>();
  const collect = (node: TagTreeNode<TagData>) => {
    result.add(node.tag.id);
    node.children.forEach(collect);
  };
  const find = (list: TagTreeNode<TagData>[]): void => {
    for (const node of list) {
      if (node.tag.id === tagId) collect(node);
      else find(node.children);
    }
  };
  find(nodes);
  return result;
}

export function TagsManager({ tags }: TagsManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [edit, setEdit] = useState<EditState>(null);
  const [text, setText] = useState("");
  const [slug, setSlug] = useState("");

  const run = (action: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setEdit(null);
        setText("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const renderTagNode = (
    node: TagTreeNode<TagData>,
    tree: TagTreeNode<TagData>[],
  ) => {
    const tag = node.tag;
    const isRoot = tag.parentTagId === null;
    const excluded = edit?.kind === "move" && edit.tagId === tag.id ? subtreeIds(tree, tag.id) : null;
    const moveCandidates = excluded
      ? tags.filter((t) => !excluded.has(t.id) && t.id !== tag.id)
      : [];

    return (
      <li key={tag.id}>
        <div className="group flex items-center gap-1">
          <span className="text-sm">{tag.name}</span>
          <span className="invisible flex gap-0.5 group-hover:visible">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => {
                setEdit({ kind: "add-child", parentId: tag.id });
                setText("");
                setSlug("");
              }}
            >
              +하위
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => {
                setEdit({ kind: "rename-tag", tagId: tag.id });
                setText(tag.name);
                setSlug(tag.slug || "");
              }}
            >
              수정
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => setEdit({ kind: "move", tagId: tag.id })}
            >
              이동
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-destructive"
              disabled={pending}
              onClick={() => run(() => deleteTag(tag.id))}
            >
              삭제
            </Button>
          </span>
        </div>

        {edit?.kind === "rename-tag" && edit.tagId === tag.id && (
          <InlineTagInput
            name={text}
            slug={slug}
            onNameChange={setText}
            onSlugChange={setSlug}
            pending={pending}
            onSubmit={() => run(() => renameTag(tag.id, text, slug))}
            onCancel={() => setEdit(null)}
          />
        )}
        {edit?.kind === "add-child" && edit.parentId === tag.id && (
          <InlineTagInput
            name={text}
            slug={slug}
            onNameChange={setText}
            onSlugChange={setSlug}
            placeholder="새 하위 태그 이름"
            pending={pending}
            onSubmit={() => run(() => createTag(tag.id, text, slug))}
            onCancel={() => setEdit(null)}
          />
        )}
        {edit?.kind === "move" && edit.tagId === tag.id && (
          <div className="my-1 flex items-center gap-2">
            <Select
              onValueChange={(v) =>
                run(() => moveTag(tag.id, v === "root" ? null : Number(v)))
              }
            >
              <SelectTrigger size="sm" className="w-56">
                <SelectValue placeholder="새 부모 태그 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">(최상위로)</SelectItem>
                {moveCandidates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setEdit(null)}>
              취소
            </Button>
          </div>
        )}

        {node.children.length > 0 && (
          <ul className="ml-4 mt-1 space-y-1 border-l pl-3">
            {node.children.map((child) => renderTagNode(child, tree))}
          </ul>
        )}
      </li>
    );
  };

  const tree = buildTagTree(tags);

  return (
    <div className="space-y-8">
      <div className="flex items-end gap-2">
        <Button
          onClick={() => {
            setEdit({ kind: "add-child", parentId: null });
            setText("");
            setSlug("");
          }}
        >
          + 루트 태그 추가
        </Button>
      </div>

      <Separator />

      <section>
        {edit?.kind === "add-child" && edit.parentId === null && (
          <InlineTagInput
            name={text}
            slug={slug}
            onNameChange={setText}
            onSlugChange={setSlug}
            placeholder="새 루트 태그 이름"
            pending={pending}
            onSubmit={() => run(() => createTag(null, text, slug))}
            onCancel={() => setEdit(null)}
          />
        )}

        <ul className="space-y-4">
          {tree.map((node) => (
            <div key={node.tag.id} className="p-4 border rounded-md">
              {renderTagNode(node, tree)}
            </div>
          ))}
        </ul>
        {tree.length === 0 && (
          <p className="text-sm text-muted-foreground mt-4">태그가 없습니다.</p>
        )}
      </section>
    </div>
  );
}

function InlineInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  pending,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  placeholder?: string;
}) {
  return (
    <div className="my-1 flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-56"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <Button size="sm" disabled={pending || value.trim() === ""} onClick={onSubmit}>
        확인
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        취소
      </Button>
    </div>
  );
}

function InlineTagInput({
  name,
  slug,
  onNameChange,
  onSlugChange,
  onSubmit,
  onCancel,
  pending,
  placeholder,
}: {
  name: string;
  slug: string;
  onNameChange: (v: string) => void;
  onSlugChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  placeholder?: string;
}) {
  return (
    <div className="my-1 flex flex-col gap-2 rounded-md border p-2 w-max">
      <div className="flex items-center gap-2">
        <span className="w-12 text-sm text-right text-muted-foreground">이름</span>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={placeholder}
          className="h-8 w-56"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
            if (e.key === "Escape") onCancel();
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12 text-sm text-right text-muted-foreground">슬러그</span>
        <Input
          value={slug}
          onChange={(e) => onSlugChange(e.target.value)}
          placeholder="자동 생성"
          className="h-8 w-56"
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
            if (e.key === "Escape") onCancel();
          }}
        />
      </div>
      <div className="flex items-center justify-end gap-2 mt-1">
        <Button size="sm" disabled={pending || name.trim() === ""} onClick={onSubmit}>
          확인
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}
