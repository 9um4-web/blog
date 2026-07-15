"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { assignSpecialPage, unassignSpecialPage } from "@/lib/actions/special-pages";
import type { ActionResult } from "@/lib/actions/tags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SpecialPagesManagerProps {
  pages: { id: number; key: string; label: string | null; postId: number; postTitle: string }[];
  allPosts: { id: number; title: string }[];
}

export function SpecialPagesManager({ pages, allPosts }: SpecialPagesManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [postId, setPostId] = useState<string>("");

  const run = (action: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else toast.error(result.error);
    });
  };

  return (
    <div className="space-y-8">
      <div className="grid max-w-2xl gap-4 sm:grid-cols-[1fr_1fr_1.5fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="sp-key">key</Label>
          <Input
            id="sp-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="main, about …"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sp-label">라벨 (선택)</Label>
          <Input
            id="sp-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="홈 화면"
          />
        </div>
        <div className="space-y-1">
          <Label>포스트</Label>
          <Select value={postId} onValueChange={setPostId}>
            <SelectTrigger>
              <SelectValue placeholder="배정할 포스트" />
            </SelectTrigger>
            <SelectContent>
              {allPosts.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          disabled={pending || key.trim() === "" || postId === ""}
          onClick={() =>
            run(async () => {
              const r = await assignSpecialPage(
                key,
                Number(postId),
                label.trim() === "" ? null : label,
              );
              if (r.ok) {
                setKey("");
                setLabel("");
                setPostId("");
                toast.success("배정했습니다. 같은 key였다면 교체(UPSERT)되었습니다.");
              }
              return r;
            })
          }
        >
          배정
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>key</TableHead>
            <TableHead>라벨</TableHead>
            <TableHead>포스트</TableHead>
            <TableHead>경로</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pages.map((page) => (
            <TableRow key={page.id}>
              <TableCell>
                <Badge variant={page.key === "main" ? "default" : "secondary"}>{page.key}</Badge>
              </TableCell>
              <TableCell>{page.label}</TableCell>
              <TableCell>{page.postTitle}</TableCell>
              <TableCell className="text-muted-foreground">
                {page.key === "main" ? "/" : `/page/${page.key}`}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => run(() => unassignSpecialPage(page.key))}
                >
                  해제
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {pages.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                배정된 특수 페이지가 없습니다. main 슬롯이 비어 있으면 홈은 최신 글 목록을
                보여줍니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <p className="text-xs text-muted-foreground">
        슬롯에 배정된 포스트는 슬롯을 해제하기 전까지 삭제할 수 없고, 일반 글
        목록·RSS에서 제외됩니다. 등록된 key는 포스트 슬러그 예약어로도 동작합니다.
      </p>
    </div>
  );
}
