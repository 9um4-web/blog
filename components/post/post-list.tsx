import Link from "next/link";
import { formatDateTime } from "@/lib/format-date";
import { PostCardContent } from "./post-card-content";

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
    <ul className="border-b">
      {posts.map((post) => (
        <li key={post.id} className="border-t">
          <Link href={`/${post.slug}`} className="group block py-6">
            <PostCardContent
              title={post.title}
              summary={post.summary}
              updatedIso={post.updatedAt.toISOString()}
              updatedLabel={formatDateTime(post.updatedAt, timeZone)}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
