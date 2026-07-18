import { notFound } from "next/navigation";
import { PostEditor } from "@/components/admin/post-editor";
import {
  getPostById,
  getPostSeriesIds,
  getPostTagIds,
  listAllTags,
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

  const [tags, seriesList, tagIds, seriesIds] = await Promise.all([
    listAllTags(),
    listSeries(),
    getPostTagIds(postId),
    getPostSeriesIds(postId),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">포스트 편집</h1>
      <PostEditor
        post={post}
        tags={tags}
        seriesList={seriesList}
        initialTagIds={tagIds}
        initialSeriesIds={seriesIds}
      />
    </div>
  );
}
