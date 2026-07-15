/** 이미지 업로드 검증/경로 규칙 (순수 함수) */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

/** 허용 MIME 타입 → 표준 확장자 */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

export type ImageValidation =
  | { ok: true }
  | { ok: false; reason: "unsupported-type" | "too-large" | "empty" };

export function validateImageUpload(mimeType: string, size: number): ImageValidation {
  if (!(mimeType in ALLOWED_IMAGE_TYPES)) return { ok: false, reason: "unsupported-type" };
  if (size <= 0) return { ok: false, reason: "empty" };
  if (size > MAX_IMAGE_BYTES) return { ok: false, reason: "too-large" };
  return { ok: true };
}

/**
 * 업로드 파일명을 URL 경로에 안전한 형태로 정규화.
 * 확장자는 MIME 타입 기준으로 강제해 Cloudflare 엣지 캐시(확장자 기반)가 동작하게 한다.
 */
export function sanitizeImageFilename(original: string, mimeType: string): string {
  const ext = ALLOWED_IMAGE_TYPES[mimeType] ?? "bin";
  const stem = original
    .replace(/\.[^.]*$/, "") // 원래 확장자 제거
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${stem.length > 0 ? stem : "image"}.${ext}`;
}

/** 게시 뷰/에디터에서 쓰는 공개 URL 경로 */
export function imagePath(id: number, filename: string): string {
  return `/images/${id}/${filename}`;
}

/** 에디터에 삽입할 마크다운 스니펫 */
export function imageMarkdown(id: number, filename: string, alt = ""): string {
  return `![${alt}](${imagePath(id, filename)})`;
}
