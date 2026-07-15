import { notFound } from "next/navigation";
import { PostArticle } from "@/components/post/post-article";
import { getSpecialPagePost } from "@/lib/db/queries";

/** SpecialPage 범용 경로: /page/{key} (스펙 8장) */
export default async function SpecialPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const post = await getSpecialPagePost(key);
  if (!post) notFound();
  return <PostArticle post={post} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const post = await getSpecialPagePost(key);
  return { title: post?.title ?? "페이지를 찾을 수 없음" };
}
