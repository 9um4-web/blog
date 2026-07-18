"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addPostToSeries,
  createSeries,
  deleteSeries,
  movePostInSeries,
  removePostFromSeries,
  updateSeries,
} from "@/lib/actions/series";
import type { ActionResult } from "@/lib/actions/tags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface SeriesManagerProps {
  seriesList: {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    isCompleted: boolean;
    posts: { postId: number; title: string; order: string }[];
  }[];
  allPosts: { id: number; title: string }[];
}

export function SeriesManager({ seriesList, allPosts }: SeriesManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");

  const run = (action: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else toast.error(result.error);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium">새 시리즈</p>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="시리즈 이름"
              className="w-48"
            />
            <Input
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="슬러그 (자동 생성)"
              className="w-48"
            />
          </div>
        </div>
        <Button
          disabled={pending || newName.trim() === ""}
          onClick={() =>
            run(async () => {
              const r = await createSeries(newName, null, newSlug);
              if (r.ok) {
                setNewName("");
                setNewSlug("");
              }
              return r;
            })
          }
        >
          추가
        </Button>
      </div>

      {seriesList.map((series) => {
        const memberIds = new Set(series.posts.map((p) => p.postId));
        const addable = allPosts.filter((p) => !memberIds.has(p.id));
        return (
          <Card key={series.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                {editingId === series.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="이름"
                      className="w-40 text-sm font-normal"
                    />
                    <Input
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value)}
                      placeholder="슬러그"
                      className="w-40 text-sm font-normal"
                    />
                    <Button
                      size="sm"
                      disabled={pending || editName.trim() === ""}
                      onClick={() =>
                        run(async () => {
                          const r = await updateSeries(series.id, { name: editName, slug: editSlug });
                          if (r.ok) setEditingId(null);
                          return r;
                        })
                      }
                    >
                      저장
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      취소
                    </Button>
                  </div>
                ) : (
                  <>
                    <span>{series.name}</span>
                    <span className="text-sm font-normal text-muted-foreground">/{series.slug}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setEditingId(series.id);
                        setEditName(series.name);
                        setEditSlug(series.slug || "");
                      }}
                    >
                      수정
                    </Button>
                  </>
                )}
                {series.isCompleted && <Badge variant="secondary">완결</Badge>}
                <label className="ml-auto flex items-center gap-2 text-sm font-normal">
                  완결
                  <Switch
                    checked={series.isCompleted}
                    disabled={pending}
                    onCheckedChange={(v) =>
                      run(() => updateSeries(series.id, { isCompleted: v }))
                    }
                  />
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`시리즈 "${series.name}"을(를) 삭제할까요? 포스트는 유지됩니다.`)) {
                      run(() => deleteSeries(series.id));
                    }
                  }}
                >
                  삭제
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="space-y-1">
                {series.posts.map((post, i) => (
                  <li key={post.postId} className="flex items-center gap-2 text-sm">
                    <span className="w-6 text-right text-muted-foreground">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{post.title}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      disabled={pending || i === 0}
                      onClick={() => run(() => movePostInSeries(series.id, post.postId, "up"))}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      disabled={pending || i === series.posts.length - 1}
                      onClick={() => run(() => movePostInSeries(series.id, post.postId, "down"))}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-destructive"
                      disabled={pending}
                      onClick={() => run(() => removePostFromSeries(post.postId, series.id))}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </li>
                ))}
                {series.posts.length === 0 && (
                  <p className="text-sm text-muted-foreground">포스트가 없습니다.</p>
                )}
              </ol>

              {addable.length > 0 && (
                <Select
                  onValueChange={(v) => run(() => addPostToSeries(Number(v), series.id))}
                >
                  <SelectTrigger size="sm" className="w-72">
                    <SelectValue placeholder="포스트 추가 (맨 뒤에)" />
                  </SelectTrigger>
                  <SelectContent>
                    {addable.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
