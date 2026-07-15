import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listSeries } from "@/lib/db/queries";

export const metadata = { title: "시리즈" };

export default async function SeriesListPage() {
  const rows = await listSeries();
  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <h1 className="mb-6 text-2xl font-bold">시리즈</h1>
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">아직 시리즈가 없습니다.</p>
      )}
      <ul className="divide-y">
        {rows.map((s) => (
          <li key={s.id}>
            <Link
              href={`/series/${s.id}`}
              className="flex items-center gap-3 py-3 hover:bg-accent/50"
            >
              <span className="font-medium">{s.name}</span>
              {s.isCompleted && <Badge variant="secondary">완결</Badge>}
              {s.description && (
                <span className="truncate text-sm text-muted-foreground">
                  {s.description}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
