import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostList } from "@/components/post/post-list";
import { Badge } from "@/components/ui/badge";
import { getSiteSettings, getTagBySlug, listPostsByTag } from "@/lib/db/queries";

/**
 * 태그 페이지. "하위 태그 포함"은 저장 속성이 아닌 뷰 옵션 —
 * 기본값 포함(on), 쿼리스트링 ?sub=0으로 끔 (스펙 5장)
 */
export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sub?: string }>;
}) {
  const [{ slug }, { sub }] = await Promise.all([params, searchParams]);
  if (!slug) notFound();

  const tag = await getTagBySlug(slug);
  if (!tag) notFound();

  const includeDescendants = sub !== "0";
  const [posts, { timeZone }] = await Promise.all([
    listPostsByTag(tag.id, includeDescendants),
    getSiteSettings(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{tag.name}</h1>
          <Badge variant="secondary" className="rounded-full">
            {posts.length}
          </Badge>
        </div>
        <Link
          href={includeDescendants ? `/tag/${tag.slug}?sub=0` : `/tag/${tag.slug}`}
          className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronDown className="size-3" />
          하위 태그 {includeDescendants ? "포함" : "제외"}
        </Link>
      </div>
      <PostList posts={posts} timeZone={timeZone} />
    </div>
  );
}
