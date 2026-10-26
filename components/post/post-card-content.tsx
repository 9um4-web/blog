interface PostCardContentProps {
  title: string;
  summary?: string;
  updatedIso?: string;
  updatedLabel?: string;
}

/** 글 카드 내부. 날짜(모노) → 제목 → 요약 순. 바깥 링크에 `group`이 있으면 제목이 hover 때 포인트 색이 된다 */
export function PostCardContent({ title, summary, updatedIso, updatedLabel }: PostCardContentProps) {
  return (
    <>
      {updatedIso && updatedLabel && (
        <time dateTime={updatedIso} className="block font-mono text-xs text-muted-foreground">
          {updatedLabel}
        </time>
      )}
      <span
        className={`block text-lg leading-snug font-semibold tracking-tight transition-colors group-hover:text-primary ${updatedIso ? "mt-2" : ""}`}
      >
        {title}
      </span>
      {summary && (
        <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-muted-foreground">
          {summary}
        </p>
      )}
    </>
  );
}
