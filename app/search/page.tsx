import { PostList } from "@/components/post/post-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchPublicPosts } from "@/lib/db/queries";

export const metadata = { title: "검색" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query.length > 0 ? await searchPublicPosts(query) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <h1 className="mb-6 text-2xl font-bold">검색</h1>
      <form action="/search" className="mb-8 flex gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="제목 또는 본문 검색"
          autoFocus
          className="max-w-md"
        />
        <Button type="submit">검색</Button>
      </form>

      {results !== null && (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            “{query}” 검색 결과 {results.length}건
            {results.length === 50 && " (최대 50건 표시)"}
          </p>
          <PostList posts={results} />
        </>
      )}
    </div>
  );
}
