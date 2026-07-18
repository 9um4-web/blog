import { SeriesAccordionCard } from "@/components/post/series-card-parts";
import { listSeries, listSeriesPosts } from "@/lib/db/queries";

export const metadata = { title: "시리즈" };

export default async function SeriesListPage() {
  const rows = await listSeries();
  const withPosts = await Promise.all(
    rows.map(async (s) => ({ ...s, posts: await listSeriesPosts(s.id) })),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <h1 className="mb-6 text-2xl font-bold">시리즈</h1>
      {withPosts.length === 0 && (
        <p className="text-sm text-muted-foreground">아직 시리즈가 없습니다.</p>
      )}
      <div className="space-y-2">
        {withPosts.map((s) => (
          <SeriesAccordionCard
            key={s.id}
            id={s.id}
            slug={s.slug}
            name={s.name}
            isCompleted={s.isCompleted}
            description={s.description}
            posts={s.posts}
          />
        ))}
      </div>
    </div>
  );
}
