import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
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
      <Accordion type="multiple" className="rounded-lg border px-4">
        {withPosts.map((s) => (
          <AccordionItem key={s.id} value={String(s.id)}>
            <AccordionTrigger>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="font-medium">{s.name}</span>
                {s.isCompleted && (
                  <Badge variant="secondary" className="shrink-0">
                    완결
                  </Badge>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {s.posts.length}편
                </span>
                {s.description && (
                  <span className="min-w-0 truncate text-sm font-normal text-muted-foreground">
                    {s.description}
                  </span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {s.posts.length > 0 ? (
                <ol className="list-decimal space-y-1.5 pl-6">
                  {s.posts.map((p) => (
                    <li key={p.postId}>
                      <Link href={`/${p.slug}`} className="hover:underline">
                        {p.title}
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  이 시리즈에 속한 글이 없습니다.
                </p>
              )}
              <Link
                href={`/series/${s.id}`}
                className="mt-3 inline-block text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                시리즈 페이지에서 보기 →
              </Link>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
