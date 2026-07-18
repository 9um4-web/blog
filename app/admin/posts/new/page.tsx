import { PostEditor } from "@/components/admin/post-editor";
import { listAllTags, listSeries } from "@/lib/db/queries";

export const metadata = { title: "새 포스트" };

export default async function NewPostPage() {
  const [tags, seriesList] = await Promise.all([
    listAllTags(),
    listSeries(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">새 포스트</h1>
      <PostEditor
        post={null}
        tags={tags}
        seriesList={seriesList}
        initialTagIds={[]}
        initialSeriesIds={[]}
      />
    </div>
  );
}
