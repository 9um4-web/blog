import { PostArticle } from "@/components/post/post-article";
import { PostList } from "@/components/post/post-list";
import { getSiteSettings, getSpecialPagePost, listPublicPosts } from "@/lib/db/queries";

/** 홈: main 슬롯 포스트를 렌더, 비어 있으면 최신 포스트 목록 fallback (스펙 8장) */
export default async function HomePage() {
  const mainPost = await getSpecialPagePost("main");
  if (mainPost) {
    return <PostArticle post={mainPost} />;
  }

  const [posts, { timeZone }] = await Promise.all([listPublicPosts(), getSiteSettings()]);
  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <h1 className="mb-6 text-2xl font-bold">최신 글</h1>
      <PostList posts={posts} timeZone={timeZone} />
    </div>
  );
}
