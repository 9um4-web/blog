import { db } from "@/lib/db";
import { images } from "@/lib/db/schema";
import { isAuthenticated } from "@/lib/auth/session";
import {
  imageMarkdown,
  imagePath,
  MAX_IMAGE_BYTES,
  sanitizeImageFilename,
  validateImageUpload,
} from "@/lib/domain/image";

const ERROR_MESSAGES = {
  "unsupported-type": "지원하지 않는 이미지 형식입니다. (png/jpg/gif/webp/avif/svg)",
  "too-large": `이미지는 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB를 넘을 수 없습니다.`,
  empty: "빈 파일입니다.",
} as const;

/** 에디터의 이미지 업로드 (관리자 전용) */
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file 필드가 필요합니다." }, { status: 400 });
  }

  const validation = validateImageUpload(file.type, file.size);
  if (!validation.ok) {
    return Response.json({ error: ERROR_MESSAGES[validation.reason] }, { status: 400 });
  }

  const filename = sanitizeImageFilename(file.name, file.type);
  const data = Buffer.from(await file.arrayBuffer());

  const [inserted] = await db
    .insert(images)
    .values({ filename, mimeType: file.type, data, size: data.byteLength })
    .returning({ id: images.id });

  return Response.json({
    id: inserted.id,
    filename,
    url: imagePath(inserted.id, filename),
    markdown: imageMarkdown(inserted.id, filename),
  });
}
