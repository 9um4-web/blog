import Link from "next/link";
import { notFound } from "next/navigation";
import { PostList } from "@/components/post/post-list";
import { Button } from "@/components/ui/button";
import { getTagById, listPostsByTag } from "@/lib/db/queries";

/**
 * 태그 페이지. "하위 태그 포함"은 저장 속성이 아닌 뷰 옵션 —
 * 기본값 포함(on), 쿼리스트링 ?sub=0으로 끔 (스펙 5장)
 */
export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sub?: string }>;
}) {
  const [{ id }, { sub }] = await Promise.all([params, searchParams]);
  const tagId = Number(id);
  if (!Number.isInteger(tagId)) notFound();

  const tag = await getTagById(tagId);
  if (!tag) notFound();

  const includeDescendants = sub !== "0";
  const posts = await listPostsByTag(tagId, includeDescendants);

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">태그: {tag.name}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href={includeDescendants ? `/tag/${tagId}?sub=0` : `/tag/${tagId}`}>
            하위 태그 {includeDescendants ? "포함" : "제외"} — 전환
          </Link>
        </Button>
      </div>
      <PostList posts={posts} />
    </div>
  );
}
