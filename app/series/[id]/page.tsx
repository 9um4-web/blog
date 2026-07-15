import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getSeriesById, listSeriesPosts } from "@/lib/db/queries";

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const seriesId = Number(id);
  if (!Number.isInteger(seriesId)) notFound();

  const series = await getSeriesById(seriesId);
  if (!series) notFound();

  const posts = await listSeriesPosts(seriesId);

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="text-2xl font-bold">{series.name}</h1>
        {series.isCompleted && <Badge variant="secondary">완결</Badge>}
      </div>
      {series.description && (
        <p className="mb-6 text-sm text-muted-foreground">{series.description}</p>
      )}
      <ol className="list-decimal space-y-2 pl-6">
        {posts.map((p) => (
          <li key={p.postId}>
            <Link href={`/${p.slug}`} className="hover:underline">
              {p.title}
            </Link>
          </li>
        ))}
      </ol>
      {posts.length === 0 && (
        <p className="text-sm text-muted-foreground">이 시리즈에 속한 글이 없습니다.</p>
      )}
    </div>
  );
}
