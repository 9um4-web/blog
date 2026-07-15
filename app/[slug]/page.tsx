import { notFound } from "next/navigation";
import { PostArticle } from "@/components/post/post-article";
import { getPostBySlug } from "@/lib/db/queries";

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // params는 Next가 이미 퍼센트 디코딩함. 추가 decode는 이중 디코딩 + %단독 문자에서 URIError 위험
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();
  return <PostArticle post={post} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  return { title: post?.title ?? "글을 찾을 수 없음" };
}
