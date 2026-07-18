interface PostCardContentProps {
  title: string;
  summary?: string;
  updatedIso?: string;
  updatedLabel?: string;
}

export function PostCardContent({ title, summary, updatedIso, updatedLabel }: PostCardContentProps) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <span className="min-w-0 truncate font-semibold">{title}</span>
        {updatedIso && updatedLabel && (
          <time dateTime={updatedIso} className="shrink-0 text-xs text-muted-foreground">
            {updatedLabel}
          </time>
        )}
      </div>
      {summary && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{summary}</p>}
    </>
  );
}
