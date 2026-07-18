/** 시스템 라우트 고정 예약어 (스펙 8장/9장). SpecialPage.key 목록과 합집합으로 검증한다. */
export const SYSTEM_RESERVED_SLUGS = [
  "api",
  "admin",
  "login",
  "logout",
  "page",
  "tag",
  "tags",
  "series",
  "search",
  "rss",
  "feed",
  "posts",
  "images",
  "guestbook",
] as const;

export const SLUG_MAX_LENGTH = 100;

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export type SlugValidation =
  | { ok: true; slug: string }
  | { ok: false; reason: "empty" | "too-long" | "invalid-chars" | "reserved" };

/**
 * 커스텀 슬러그 검증 (스펙 9.1): 최대 100자, 영문 소문자/숫자/하이픈.
 * reservedKeys에는 SpecialPage.key 전체를 DB에서 조회해 넘긴다 (동적 예약어).
 */
export function validateSlug(raw: string, reservedKeys: Iterable<string>): SlugValidation {
  const slug = raw.trim().toLowerCase();
  if (slug.length === 0) return { ok: false, reason: "empty" };
  if (slug.length > SLUG_MAX_LENGTH) return { ok: false, reason: "too-long" };
  if (!SLUG_PATTERN.test(slug)) return { ok: false, reason: "invalid-chars" };

  const reserved = new Set<string>([...SYSTEM_RESERVED_SLUGS, ...reservedKeys]);
  if (reserved.has(slug)) return { ok: false, reason: "reserved" };
  return { ok: true, slug };
}

/**
 * title 기반 슬러그 자동 생성. 허용 문자 외(한글 등)는 제거되므로
 * 남는 것이 없으면 "untitled"로 fallback.
 */
export function slugFromTitle(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH);
  return base.length > 0 ? base : "untitled";
}

/** 중복 시 -1, -2 … suffix로 dedup. taken에는 이미 사용 중인 슬러그 집합을 넘긴다. */
export function resolveSlugCollision(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 1; ; i++) {
    const suffix = `-${i}`;
    const candidate = base.slice(0, SLUG_MAX_LENGTH - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}
