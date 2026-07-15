"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createNamespace,
  createTag,
  deleteNamespace,
  deleteTag,
  moveTag,
  renameNamespace,
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
  namespaceId: number;
  parentTagId: number | null;
  name: string;
}

interface TagsManagerProps {
  namespaces: { id: number; name: string }[];
  tags: TagData[];
}

type EditState =
  | { kind: "rename-ns"; nsId: number }
  | { kind: "rename-tag"; tagId: number }
  | { kind: "add-child"; nsId: number; parentId: number | null }
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

export function TagsManager({ namespaces, tags }: TagsManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [edit, setEdit] = useState<EditState>(null);
  const [text, setText] = useState("");
  const [newNsName, setNewNsName] = useState("");

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
    nsId: number,
    tree: TagTreeNode<TagData>[],
  ) => {
    const tag = node.tag;
    const excluded = edit?.kind === "move" && edit.tagId === tag.id ? subtreeIds(tree, tag.id) : null;
    const moveCandidates = excluded
      ? tags.filter((t) => t.namespaceId === nsId && !excluded.has(t.id))
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
                setEdit({ kind: "add-child", nsId, parentId: tag.id });
                setText("");
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
              }}
            >
              이름
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
          <InlineInput
            value={text}
            onChange={setText}
            pending={pending}
            onSubmit={() => run(() => renameTag(tag.id, text))}
            onCancel={() => setEdit(null)}
          />
        )}
        {edit?.kind === "add-child" && edit.parentId === tag.id && (
          <InlineInput
            value={text}
            onChange={setText}
            placeholder="새 하위 태그 이름"
            pending={pending}
            onSubmit={() => run(() => createTag(nsId, tag.id, text))}
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
            {node.children.map((child) => renderTagNode(child, nsId, tree))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium">새 네임스페이스</p>
          <Input
            value={newNsName}
            onChange={(e) => setNewNsName(e.target.value)}
            placeholder="예: 주제, 언어"
            className="w-56"
          />
        </div>
        <Button
          disabled={pending || newNsName.trim() === ""}
          onClick={() =>
            run(async () => {
              const r = await createNamespace(newNsName);
              if (r.ok) setNewNsName("");
              return r;
            })
          }
        >
          추가
        </Button>
      </div>

      <Separator />

      {namespaces.map((ns) => {
        const tree = buildTagTree(tags.filter((t) => t.namespaceId === ns.id));
        return (
          <section key={ns.id}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-lg font-semibold">{ns.name}</h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs"
                onClick={() => {
                  setEdit({ kind: "rename-ns", nsId: ns.id });
                  setText(ns.name);
                }}
              >
                이름
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs"
                onClick={() => {
                  setEdit({ kind: "add-child", nsId: ns.id, parentId: null });
                  setText("");
                }}
              >
                +루트 태그
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs text-destructive"
                disabled={pending}
                onClick={() => run(() => deleteNamespace(ns.id))}
              >
                삭제
              </Button>
            </div>

            {edit?.kind === "rename-ns" && edit.nsId === ns.id && (
              <InlineInput
                value={text}
                onChange={setText}
                pending={pending}
                onSubmit={() => run(() => renameNamespace(ns.id, text))}
                onCancel={() => setEdit(null)}
              />
            )}
            {edit?.kind === "add-child" && edit.nsId === ns.id && edit.parentId === null && (
              <InlineInput
                value={text}
                onChange={setText}
                placeholder="새 루트 태그 이름"
                pending={pending}
                onSubmit={() => run(() => createTag(ns.id, null, text))}
                onCancel={() => setEdit(null)}
              />
            )}

            <ul className="space-y-1">
              {tree.map((node) => renderTagNode(node, ns.id, tree))}
            </ul>
            {tree.length === 0 && (
              <p className="text-sm text-muted-foreground">태그가 없습니다.</p>
            )}
          </section>
        );
      })}
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
