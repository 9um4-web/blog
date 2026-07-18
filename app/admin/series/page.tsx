import { SeriesManager } from "@/components/admin/series-manager";
import { listPostsForAdmin, listSeries, listSeriesPosts } from "@/lib/db/queries";

export const metadata = { title: "시리즈 관리" };

export default async function AdminSeriesPage() {
  const [seriesRows, allPosts] = await Promise.all([listSeries(), listPostsForAdmin()]);
  const seriesList = await Promise.all(
    seriesRows.map(async (s) => ({
      ...s,
      posts: (await listSeriesPosts(s.id, true)).map((p) => ({
        postId: p.postId,
        title: p.title,
        order: p.order,
      })),
    })),
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">시리즈</h1>
      <SeriesManager
        seriesList={seriesList}
        allPosts={allPosts.map((p) => ({ id: p.id, title: p.title }))}
      />
    </div>
  );
}
