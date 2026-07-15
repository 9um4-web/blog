import Link from "next/link";

const dateFmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });

interface PostListItem {
  id: number;
  title: string;
  slug: string | null;
  createdAt: Date;
}

export function PostList({ posts }: { posts: PostListItem[] }) {
  if (posts.length === 0) {
    return <p className="text-sm text-muted-foreground">아직 포스트가 없습니다.</p>;
  }
  return (
    <ul className="divide-y">
      {posts.map((post) => (
        <li key={post.id}>
          <Link
            href={`/${post.slug}`}
            className="flex items-baseline justify-between gap-4 py-3 hover:bg-accent/50"
          >
            <span className="font-medium">{post.title}</span>
            <time
              dateTime={post.createdAt.toISOString()}
              className="shrink-0 text-sm text-muted-foreground"
            >
              {dateFmt.format(post.createdAt)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
