/** 본문 임베드 한 줄(`![[슬러그]]`, `![[series/슬러그]]`)은 render.ts가 `data-embed` 자리표시 div로 바꾼다. 실제 카드는 DB가 있어야 그려서 2단계로 나눈다. */
const EMBED_PLACEHOLDER_RE = /<div\b([^>]*\bdata-embed="(?:post|series)"[^>]*)><\/div>/g;
const EMBED_POST_SLUG_PATTERN = /^[a-z0-9-]{1,100}$/;

function readAttr(attrs: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return match?.[1] ?? null;
}

function normalizePostSlug(raw: string | null): string | null {
  if (!raw) return null;
  const slug = raw.trim().toLowerCase();
  return EMBED_POST_SLUG_PATTERN.test(slug) ? slug : null;
}


function normalizeSourceLine(raw: string | null): number | null {
  if (!raw) return null;
  const val = Number(raw.trim());
  return Number.isInteger(val) && val >= 1 ? val : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface PostEmbedPostCard {
  slug: string;
  title: string;
  summary: string;
}

export interface PostEmbedSeriesItem {
  postId: number;
  title: string;
  slug: string | null;
}

export interface PostEmbedSeriesCard {
  id: number;
  slug: string;
  name: string;
  isCompleted: boolean;
  description: string | null;
  posts: PostEmbedSeriesItem[];
}

export interface PostEmbedData {
  postCards: PostEmbedPostCard[];
  seriesCards: PostEmbedSeriesCard[];
}

type RawEmbedPart =
  | { kind: "html"; html: string }
  | { kind: "post"; slug: string; sourceLines?: { start: number; end: number } }
  | { kind: "series"; seriesSlug: string; sourceLines?: { start: number; end: number } }
  | { kind: "error"; message: string; sourceLines?: { start: number; end: number } };

export type HydratedPostBodyPart =
  | { kind: "html"; html: string }
  | { kind: "post-card"; card: PostEmbedPostCard; sourceLines?: { start: number; end: number } }
  | { kind: "series-card"; series: PostEmbedSeriesCard; sourceLines?: { start: number; end: number } }
  | { kind: "error"; message: string; sourceLines?: { start: number; end: number } };

export function splitPostEmbedParts(html: string): RawEmbedPart[] {
  const parts: RawEmbedPart[] = [];
  let lastIndex = 0;

  for (const match of html.matchAll(EMBED_PLACEHOLDER_RE)) {
    const full = match[0];
    const attrs = match[1] ?? "";
    const index = match.index ?? 0;

    if (index > lastIndex) {
      const chunk = html.slice(lastIndex, index);
      if (chunk.length > 0) parts.push({ kind: "html", html: chunk });
    }

    const type = readAttr(attrs, "data-embed");
    const sl = normalizeSourceLine(readAttr(attrs, "data-sl"));
    const el = normalizeSourceLine(readAttr(attrs, "data-el"));
    const sourceLines = sl !== null && el !== null ? { start: sl, end: el } : undefined;

    if (type === "post") {
      const slug = normalizePostSlug(readAttr(attrs, "data-post-slug"));
      if (slug) parts.push({ kind: "post", slug, sourceLines });
      else parts.push({ kind: "error", message: "[post: 잘못된 slug]", sourceLines });
    } else if (type === "series") {
      const seriesSlug = normalizePostSlug(readAttr(attrs, "data-series-slug"));
      if (seriesSlug) parts.push({ kind: "series", seriesSlug, sourceLines });
      else parts.push({ kind: "error", message: "[series: 잘못된 slug]", sourceLines });
    }

    lastIndex = index + full.length;
  }

  if (lastIndex < html.length) {
    const tail = html.slice(lastIndex);
    if (tail.length > 0) parts.push({ kind: "html", html: tail });
  }

  if (parts.length === 0) return [{ kind: "html", html }];
  return parts;
}

export function extractPostEmbedRequests(parts: RawEmbedPart[]) {
  const postSlugs = new Set<string>();
  const seriesSlugs = new Set<string>();

  for (const part of parts) {
    if (part.kind === "post") postSlugs.add(part.slug);
    else if (part.kind === "series") seriesSlugs.add(part.seriesSlug);
  }

  return { postSlugs: [...postSlugs], seriesSlugs: [...seriesSlugs] };
}

export function hydratePostEmbedParts(parts: RawEmbedPart[], data: PostEmbedData): HydratedPostBodyPart[] {
  const postBySlug = new Map(data.postCards.map((card) => [card.slug, card]));
  const seriesBySlug = new Map(data.seriesCards.map((series) => [series.slug, series]));

  return parts.map((part): HydratedPostBodyPart => {
    if (part.kind === "html") return part;

    const sourceLines = part.sourceLines;
    if (part.kind === "error") {
      return { kind: "error", message: part.message, sourceLines };
    }

    if (part.kind === "post") {
      const card = postBySlug.get(part.slug);
      return card
        ? { kind: "post-card", card, sourceLines }
        : { kind: "error", message: `[post: 찾을 수 없는 포스트 (${escapeHtml(part.slug)})]`, sourceLines };
    }

    const series = seriesBySlug.get(part.seriesSlug);
    return series
      ? { kind: "series-card", series, sourceLines }
      : { kind: "error", message: `[series: 찾을 수 없는 시리즈 (${escapeHtml(part.seriesSlug)})]`, sourceLines };
  });
}

export type EmbedLine = { kind: "post"; slug: string } | { kind: "series"; slug: string };

/** 한 줄(`![[슬러그]]` / `![[series/슬러그]]`)을 읽는다. 임베드가 아니거나 슬러그가 잘못됐으면 null. 시각 편집기의 참조(reference) 가져오기가 쓴다. */
export function parseEmbedLine(text: string): EmbedLine | null {
  const match = /^\s*!\[\[([^\]\n|#]+)\]\]\s*$/.exec(text);
  if (!match) return null;
  const target = match[1].trim();
  const series = /^series\/(.+)$/.exec(target);
  const slug = normalizePostSlug(series ? series[1] : target);
  if (!slug) return null;
  return series ? { kind: "series", slug } : { kind: "post", slug };
}

/** parseEmbedLine의 반대: 임베드를 한 줄 Markdown으로. */
export function formatEmbedLine(embed: EmbedLine): string {
  return embed.kind === "post" ? `![[${embed.slug}]]` : `![[series/${embed.slug}]]`;
}
