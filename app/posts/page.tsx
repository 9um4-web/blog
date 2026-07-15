import { PostList } from "@/components/post/post-list";
import { listPublicPosts } from "@/lib/db/queries";

export const metadata = { title: "글 목록" };

export default async function PostsPage() {
  const posts = await listPublicPosts();
  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <h1 className="mb-6 text-2xl font-bold">글 목록</h1>
      <PostList posts={posts} />
    </div>
  );
}
