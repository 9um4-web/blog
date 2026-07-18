import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export interface SeriesCardPostItem {
  postId: number;
  title: string;
  slug: string | null;
}

interface SeriesCardHeadingProps {
  name: string;
  isCompleted: boolean;
  count: number;
  description?: string | null;
}

export function SeriesCardHeading({ name, isCompleted, count, description }: SeriesCardHeadingProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <span className="font-medium">{name}</span>
      {isCompleted && (
        <Badge variant="secondary" className="shrink-0">
          완결
        </Badge>
      )}
      <span className="shrink-0 text-xs text-muted-foreground">{count}편</span>
      {description && (
        <span className="min-w-0 truncate text-sm font-normal text-muted-foreground">
          {description}
        </span>
      )}
    </div>
  );
}

interface SeriesCardPostsProps {
  posts: SeriesCardPostItem[];
  linkMode?: "next" | "anchor";
  listClassName?: string;
  linkClassName?: string;
  emptyClassName?: string;
}

export function SeriesCardPosts({
  posts,
  linkMode = "next",
  listClassName = "list-decimal space-y-1.5 pl-6",
  linkClassName = "hover:underline",
  emptyClassName = "text-sm text-muted-foreground",
}: SeriesCardPostsProps) {
  if (posts.length === 0) {
    return <p className={emptyClassName}>이 시리즈에 속한 글이 없습니다.</p>;
  }

  return (
    <ol className={listClassName}>
      {posts.map((post) => (
        <li key={post.postId}>
          {post.slug === null ? (
            <span className="text-muted-foreground">{post.title}</span>
          ) : linkMode === "next" ? (
            <Link href={`/${post.slug}`} className={linkClassName}>
              {post.title}
            </Link>
          ) : (
            <a href={`/${post.slug}`} className={linkClassName}>
              {post.title}
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}

interface SeriesAccordionCardProps {
  id: number;
  slug: string;
  name: string;
  isCompleted: boolean;
  description?: string | null;
  posts: SeriesCardPostItem[];
  showSeriesPageLink?: boolean;
  className?: string;
}

export function SeriesAccordionCard({
  id,
  slug,
  name,
  isCompleted,
  description,
  posts,
  showSeriesPageLink = true,
  className = "rounded-lg border px-4",
}: SeriesAccordionCardProps) {
  return (
    <Accordion type="multiple" className={className}>
      <AccordionItem value={String(id)}>
        <AccordionTrigger>
          <SeriesCardHeading
            name={name}
            isCompleted={isCompleted}
            count={posts.length}
            description={description}
          />
        </AccordionTrigger>
        <AccordionContent>
          <SeriesCardPosts posts={posts} />
          {showSeriesPageLink && (
            <Link
              href={`/series/${slug}`}
              className="mt-3 inline-block text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              시리즈 페이지에서 보기 →
            </Link>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
