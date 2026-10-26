import { PostList } from "@/components/post/post-list";
import { getSiteSettings, listPublicPosts } from "@/lib/db/queries";

export const metadata = { title: "글 목록" };

export default async function PostsPage() {
  const [posts, { timeZone }] = await Promise.all([listPublicPosts(), getSiteSettings()]);
  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <p className="font-mono text-xs text-muted-foreground">
        <span className="text-primary">$</span> ls -t posts/
      </p>
      <h1 className="mt-2 mb-6 text-3xl font-semibold tracking-tight">글 목록</h1>
      <PostList posts={posts} timeZone={timeZone} />
    </div>
  );
}
