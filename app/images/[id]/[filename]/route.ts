import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { images } from "@/lib/db/schema";

/**
 * 이미지 서빙: /images/{id}/{filename.ext}
 * URL에 확장자가 포함되어 Cloudflare 엣지가 캐시하므로 DB 조회는 최초 1회 수준.
 * 이미지 내용은 불변(수정 대신 재업로드)이라 immutable 캐시를 걸어도 안전하다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; filename: string }> },
) {
  const { id, filename } = await params;
  const imageId = Number(id);
  if (!Number.isInteger(imageId)) {
    return new Response("Not Found", { status: 404 });
  }

  const [image] = await db.select().from(images).where(eq(images.id, imageId));
  if (!image || image.filename !== filename) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      // svg 등에 포함될 수 있는 스크립트가 문서 컨텍스트에서 실행되지 않도록
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
