import { cookies } from "next/headers";
import { PostEditor, PREVIEW_COOKIE } from "@/components/admin/post-editor";
import { listAllTags, listPostsForAdmin, listSeries } from "@/lib/db/queries";

export const metadata = { title: "새 포스트" };

export default async function NewPostPage() {
  const cookieStore = await cookies();
  const [tags, seriesList, allPosts] = await Promise.all([
    listAllTags(),
    listSeries(),
    listPostsForAdmin(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">새 포스트</h1>
      <PostEditor
        post={null}
        tags={tags}
        seriesList={seriesList}
        allPosts={allPosts
          .filter((p): p is typeof p & { slug: string } => p.slug !== null)
          .map((p) => ({ title: p.title, slug: p.slug }))}
        initialTagIds={[]}
        initialSeriesIds={[]}
        initialPreviewOpen={cookieStore.get(PREVIEW_COOKIE)?.value !== "off"}
      />
    </div>
  );
}
