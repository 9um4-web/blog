"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteImage } from "@/lib/actions/images";
import { imageMarkdown, imagePath } from "@/lib/domain/image";
import { ImageUploader } from "@/components/admin/image-uploader";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ImagesManagerProps {
  images: { id: number; filename: string; mimeType: string; size: number; createdAt: Date }[];
}

const dateFmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" });

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

export function ImagesManager({ images }: ImagesManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const copyMarkdown = async (id: number, filename: string) => {
    await navigator.clipboard.writeText(imageMarkdown(id, filename));
    toast.success("마크다운을 복사했습니다.");
  };

  const onDelete = (id: number, filename: string) => {
    if (
      !confirm(
        `"${filename}"을(를) 삭제할까요?\n이 이미지를 참조하는 본문이 있다면 그 자리는 깨진 이미지로 표시됩니다.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteImage(id);
      if (result.ok) {
        toast.success("삭제했습니다.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      <ImageUploader
        onUploaded={async (markdown) => {
          await navigator.clipboard.writeText(markdown);
          toast.info("마크다운이 클립보드에 복사되었습니다.");
          router.refresh();
        }}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">미리보기</TableHead>
            <TableHead>파일명</TableHead>
            <TableHead>크기</TableHead>
            <TableHead>업로드</TableHead>
            <TableHead className="w-44" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {images.map((image) => (
            <TableRow key={image.id}>
              <TableCell>
                {/* bytea 서빙 라우트라 next/image 최적화 대상이 아님 — 원본 그대로 표시 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePath(image.id, image.filename)}
                  alt={image.filename}
                  loading="lazy"
                  className="h-12 w-20 rounded border object-cover"
                />
              </TableCell>
              <TableCell className="font-mono text-xs">{image.filename}</TableCell>
              <TableCell className="text-muted-foreground">{formatSize(image.size)}</TableCell>
              <TableCell className="text-muted-foreground">
                {dateFmt.format(image.createdAt)}
              </TableCell>
              <TableCell className="space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyMarkdown(image.id, image.filename)}
                >
                  마크다운 복사
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => onDelete(image.id, image.filename)}
                >
                  삭제
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {images.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                업로드된 이미지가 없습니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
