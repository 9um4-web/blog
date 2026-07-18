import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getSeriesBySlug, listSeriesPosts } from "@/lib/db/queries";

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!slug) notFound();

  const series = await getSeriesBySlug(slug);
  if (!series) notFound();

  const posts = await listSeriesPosts(series.id, false);

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="text-2xl font-bold">{series.name}</h1>
        {series.isCompleted && <Badge variant="secondary">완결</Badge>}
      </div>
      {series.description && (
        <p className="mb-6 text-sm text-muted-foreground">{series.description}</p>
      )}

      {posts.length > 0 ? (
        <ol className="space-y-3">
          {posts.map((p, i) => (
            <li key={p.postId}>
              <Link
                href={`/${p.slug}`}
                className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent/50"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 truncate font-semibold">{p.title}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">이 시리즈에 속한 글이 없습니다.</p>
      )}
    </div>
  );
}
