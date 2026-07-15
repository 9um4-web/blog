"use client";

import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface UploadResponse {
  markdown?: string;
  error?: string;
}

/** 에디터용 이미지 업로드 버튼. 업로드 성공 시 마크다운 스니펫을 콜백으로 전달 */
export function ImageUploader({ onUploaded }: { onUploaded: (markdown: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/images", { method: "POST", body: formData });
      const body = (await res.json()) as UploadResponse;
      if (!res.ok || !body.markdown) {
        toast.error(body.error ?? "업로드에 실패했습니다.");
        return;
      }
      onUploaded(body.markdown);
      toast.success("이미지를 본문에 삽입했습니다.");
    } catch {
      toast.error("업로드 중 네트워크 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = ""; // 같은 파일 재선택 허용
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus className="size-4" />
        {uploading ? "업로드 중…" : "이미지 업로드"}
      </Button>
    </>
  );
}
