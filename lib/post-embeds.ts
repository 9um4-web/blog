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

function normalizeSeriesId(raw: string | null): number | null {
  if (!raw) return null;
  const id = Number(raw.trim());
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
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
  | { kind: "post"; slug: string }
  | { kind: "series"; seriesId: number }
  | { kind: "error"; message: string };

export type HydratedPostBodyPart =
  | { kind: "html"; html: string }
  | { kind: "post-card"; card: PostEmbedPostCard }
  | { kind: "series-card"; series: PostEmbedSeriesCard }
  | { kind: "error"; message: string };

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
    if (type === "post") {
      const slug = normalizePostSlug(readAttr(attrs, "data-post-slug"));
      if (slug) parts.push({ kind: "post", slug });
      else parts.push({ kind: "error", message: "[post: 잘못된 slug]" });
    } else if (type === "series") {
      const seriesId = normalizeSeriesId(readAttr(attrs, "data-series-id"));
      if (seriesId !== null) parts.push({ kind: "series", seriesId });
      else parts.push({ kind: "error", message: "[series: 잘못된 id]" });
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
  const seriesIds = new Set<number>();

  for (const part of parts) {
    if (part.kind === "post") postSlugs.add(part.slug);
    else if (part.kind === "series") seriesIds.add(part.seriesId);
  }

  return { postSlugs: [...postSlugs], seriesIds: [...seriesIds] };
}

export function hydratePostEmbedParts(parts: RawEmbedPart[], data: PostEmbedData): HydratedPostBodyPart[] {
  const postBySlug = new Map(data.postCards.map((card) => [card.slug, card]));
  const seriesById = new Map(data.seriesCards.map((series) => [series.id, series]));

  return parts.map((part): HydratedPostBodyPart => {
    if (part.kind === "html" || part.kind === "error") return part;

    if (part.kind === "post") {
      const card = postBySlug.get(part.slug);
      return card
        ? { kind: "post-card", card }
        : { kind: "error", message: `[post: 찾을 수 없는 포스트 (${escapeHtml(part.slug)})]` };
    }

    const series = seriesById.get(part.seriesId);
    return series
      ? { kind: "series-card", series }
      : { kind: "error", message: `[series: 찾을 수 없는 시리즈 (${part.seriesId})]` };
  });
}
