import Link from "next/link";
import { formatDateTime } from "@/lib/format-date";

interface PostListItem {
  id: number;
  title: string;
  slug: string | null;
  updatedAt: Date;
  /** 요약(없으면 본문 발췌가 채워져 들어옴). 빈 문자열이면 표시 생략 */
  summary: string;
}

export function PostList({ posts, timeZone }: { posts: PostListItem[]; timeZone: string }) {
  if (posts.length === 0) {
    return <p className="text-sm text-muted-foreground">아직 포스트가 없습니다.</p>;
  }
  return (
    <ul className="space-y-3">
      {posts.map((post) => (
        <li key={post.id}>
          <Link
            href={`/${post.slug}`}
            className="block rounded-lg border p-4 transition-colors hover:bg-accent/50"
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 truncate font-semibold">{post.title}</span>
              <time
                dateTime={post.updatedAt.toISOString()}
                className="shrink-0 text-xs text-muted-foreground"
              >
                {formatDateTime(post.updatedAt, timeZone)}
              </time>
            </div>
            {post.summary && (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{post.summary}</p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
