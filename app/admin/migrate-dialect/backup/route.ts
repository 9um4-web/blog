import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { posts } from "@/lib/db/schema";

// 변환 전에 받아 두는 원본 백업(글 id·제목·슬러그·본문 JSON). 변환을 되돌려야 하면 이 파일의 contentMd로 글을 다시 저장한다.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) return new NextResponse("Unauthorized", { status: 401 });
  const rows = await db
    .select({ id: posts.id, title: posts.title, slug: posts.slug, contentMd: posts.contentMd, summary: posts.summary, updatedAt: posts.updatedAt })
    .from(posts)
    .orderBy(posts.id);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(rows, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="posts-before-dialect-migration-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
