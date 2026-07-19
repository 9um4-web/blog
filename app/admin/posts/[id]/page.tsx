import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PostEditor } from "@/components/admin/post-editor";
import { EDITOR_MODE_COOKIE, parseEditorMode } from "@/lib/editor-utils";
import {
  getPostById,
  getPostSeriesIds,
  getPostTagIds,
  listAllTags,
  listImagesForAdmin,
  listPostsForAdmin,
  listSeries,
} from "@/lib/db/queries";

export const metadata = { title: "포스트 편집" };

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId)) notFound();

  const post = await getPostById(postId);
  if (!post) notFound();

  const cookieStore = await cookies();
  const [tags, seriesList, allPosts, tagIds, seriesIds, images] = await Promise.all([
    listAllTags(),
    listSeries(),
    listPostsForAdmin(),
    getPostTagIds(postId),
    getPostSeriesIds(postId),
    listImagesForAdmin(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">포스트 편집</h1>
      <PostEditor
        post={post}
        tags={tags}
        seriesList={seriesList}
        allPosts={allPosts
          .filter((p): p is typeof p & { slug: string } => p.slug !== null)
          .map((p) => ({ title: p.title, slug: p.slug }))}
        images={images}
        initialTagIds={tagIds}
        initialSeriesIds={seriesIds}
        initialMode={parseEditorMode(cookieStore.get(EDITOR_MODE_COOKIE)?.value)}
      />
    </div>
  );
}
