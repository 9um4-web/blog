import { and, asc, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  images,
  settings,
  posts,
  postSeries,
  postTags,
  series,
  specialPages,
  tagClosure,
  tags,
} from "@/lib/db/schema";
import { excerptFromMarkdown } from "@/lib/domain/markdown";
import { mergeNavItems, type NavItem, type StoredNavEntry } from "@/lib/nav-items";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

// ---------- 포스트 ----------

/** 목록 카드용: 요약이 있으면 요약, 없으면 본문 문단 발췌로 대체 (원문 전체는 반환하지 않음) */
function withListSummary<T extends { summary: string | null; contentMd: string }>(rows: T[]) {
  return rows.map(({ contentMd, summary, ...rest }) => ({
    ...rest,
    summary: summary?.trim() || excerptFromMarkdown(contentMd),
  }));
}

export async function listPostsForAdmin() {
  return db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      updatedAt: posts.updatedAt,
      parseError: posts.parseError,
      unlisted: posts.unlisted,
    })
    .from(posts)
    .orderBy(desc(posts.updatedAt));
}

export async function getPostById(id: number) {
  const [post] = await db.select().from(posts).where(eq(posts.id, id));
  return post ?? null;
}

export async function getPostBySlug(slug: string) {
  const [post] = await db.select().from(posts).where(eq(posts.slug, slug));
  return post ?? null;
}

export async function getPostTagIds(postId: number): Promise<number[]> {
  const rows = await db
    .select({ tagId: postTags.tagId })
    .from(postTags)
    .where(eq(postTags.postId, postId));
  return rows.map((r) => r.tagId);
}

export async function listTagsOfPost(postId: number) {
  return db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(eq(postTags.postId, postId))
    .orderBy(asc(tags.name));
}

export async function getPostSeriesIds(postId: number): Promise<number[]> {
  const rows = await db
    .select({ seriesId: postSeries.seriesId })
    .from(postSeries)
    .where(eq(postSeries.postId, postId));
  return rows.map((r) => r.seriesId);
}

/**
 * 공개 포스트 목록. SpecialPage에 배정된 포스트는 목록/RSS에서 제외
 * (별도 플래그가 아니라 SpecialPage 존재 여부가 단일 진실 소스, 스펙 8장)
 */
export async function listPublicPosts() {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      summary: posts.summary,
      contentMd: posts.contentMd,
    })
    .from(posts)
    .where(
      and(
        notInArray(posts.id, db.select({ id: specialPages.postId }).from(specialPages)),
        eq(posts.unlisted, false),
      ),
    )
    .orderBy(desc(posts.createdAt));
  return withListSummary(rows);
}

/** LIKE 패턴 메타문자(%, _, \)를 이스케이프해 검색어를 리터럴로 취급 */
function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** 제목/본문 부분 일치 검색. 특수 페이지 배정 포스트는 목록과 동일하게 제외 */
export async function searchPublicPosts(query: string) {
  const pattern = `%${escapeLikePattern(query)}%`;
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      summary: posts.summary,
      contentMd: posts.contentMd,
    })
    .from(posts)
    .where(
      and(
        notInArray(posts.id, db.select({ id: specialPages.postId }).from(specialPages)),
        eq(posts.unlisted, false),
        or(ilike(posts.title, pattern), ilike(posts.contentMd, pattern)),
      ),
    )
    .orderBy(desc(posts.createdAt))
    .limit(50);
  return withListSummary(rows);
}

/** 임베드 카드용 공개 포스트 조회 (SpecialPage 배정 포스트 제외) */
export async function listPublicPostCardsBySlugs(slugs: string[]) {
  const normalized = [...new Set(slugs.map((slug) => slug.trim()).filter((slug) => slug.length > 0))];
  if (normalized.length === 0) return [];

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      updatedAt: posts.updatedAt,
      summary: posts.summary,
      contentMd: posts.contentMd,
    })
    .from(posts)
    .where(
      and(
        inArray(posts.slug, normalized),
        notInArray(posts.id, db.select({ id: specialPages.postId }).from(specialPages)),
        eq(posts.unlisted, false),
      ),
    );

  const summarized = withListSummary(rows);
  const cards: Array<{ title: string; slug: string; summary: string }> = [];
  for (const row of summarized) {
    if (row.slug === null) continue;
    cards.push({ title: row.title, slug: row.slug, summary: row.summary });
  }
  return cards;
}

// ---------- 사이트 설정 ----------

export const DEFAULT_SITE_NAME = "Blog";

export async function getSiteName(): Promise<string> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "site_name"));
  const value = row?.value.trim();
  return value && value.length > 0 ? value : DEFAULT_SITE_NAME;
}

export interface GiscusConfig {
  repo: string;
  repoId: string;
  category: string;
  categoryId: string;
}

export interface SiteConfig {
  siteName: string;
  siteEmail: string | null;
  /** 포스트 상단에 요약을 표시할지 (기본 true) */
  showSummaryOnPost: boolean;
  /** 푸터 SNS 링크 (미설정 키는 null) */
  social: {
    github: string | null;
    x: string | null;
    soundcloud: string | null;
    youtube: string | null;
  };
  /** Giscus 댓글 설정. 필수값이 모두 채워졌을 때만 non-null */
  giscus: GiscusConfig | null;
  /** 사이트 글꼴 (app/fonts.ts의 FONT_OPTIONS 값, 기본 geist) */
  siteFont: string;
  /** 날짜/시간 표시 타임존 (IANA 이름, 기본 Asia/Seoul) */
  timeZone: string;
}

/** 레이아웃/포스트에서 쓰는 사이트 설정 일괄 조회 (setting 테이블은 작아 전체 조회) */
export async function getSiteSettings(): Promise<SiteConfig> {
  const rows = await db.select().from(settings);
  const map = new Map(rows.map((r) => [r.key, r.value.trim()]));
  const social = (key: string) => map.get(`social_${key}`) || null;

  const giscusRepo = map.get("giscus_repo") || "";
  const giscusRepoId = map.get("giscus_repo_id") || "";
  const giscusCategory = map.get("giscus_category") || "";
  const giscusCategoryId = map.get("giscus_category_id") || "";
  const giscus =
    giscusRepo && giscusRepoId && giscusCategory && giscusCategoryId
      ? {
          repo: giscusRepo,
          repoId: giscusRepoId,
          category: giscusCategory,
          categoryId: giscusCategoryId,
        }
      : null;

  return {
    siteName: map.get("site_name") || DEFAULT_SITE_NAME,
    siteEmail: map.get("site_email") || null,
    showSummaryOnPost: map.get("show_summary") !== "false",
    social: {
      github: social("github"),
      x: social("x"),
      soundcloud: social("soundcloud"),
      youtube: social("youtube"),
    },
    giscus,
    siteFont: map.get("site_font") || "geist",
    timeZone: map.get("site_timezone") || DEFAULT_TIMEZONE,
  };
}

/**
 * 헤더 내비게이션 전체 목록 (disabled 포함). 관리 화면은 이걸 그대로 쓰고,
 * 공개 헤더는 이 중 enabled만 걸러서 렌더한다 (lib/nav-items.ts 참고).
 */
export async function getNavItems(): Promise<NavItem[]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "nav_items"));
  let stored: StoredNavEntry[] = [];
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) stored = parsed;
    } catch {
      stored = [];
    }
  }
  const seriesList = await db
    .select({ id: series.id, slug: series.slug, name: series.name })
    .from(series)
    .orderBy(asc(series.name));
  return mergeNavItems(stored, seriesList);
}

// ---------- 이미지 ----------

/** 관리 목록용 — bytea data 컬럼은 제외하고 메타데이터만 */
export async function listImagesForAdmin() {
  return db
    .select({
      id: images.id,
      filename: images.filename,
      mimeType: images.mimeType,
      size: images.size,
      createdAt: images.createdAt,
    })
    .from(images)
    .orderBy(desc(images.createdAt));
}

// ---------- 특수 페이지 ----------

export async function listSpecialPages() {
  return db
    .select({
      id: specialPages.id,
      key: specialPages.key,
      label: specialPages.label,
      postId: specialPages.postId,
      postTitle: posts.title,
    })
    .from(specialPages)
    .innerJoin(posts, eq(specialPages.postId, posts.id))
    .orderBy(asc(specialPages.key));
}

export async function getSpecialPagePost(key: string) {
  const [row] = await db
    .select({ post: posts })
    .from(specialPages)
    .innerJoin(posts, eq(specialPages.postId, posts.id))
    .where(eq(specialPages.key, key));
  return row?.post ?? null;
}

// ---------- 태그 ----------

export async function listRootTags() {
  return db
    .select({
      id: tags.id,
      parentTagId: tags.parentTagId,
      name: tags.name,
      slug: tags.slug,
    })
    .from(tags)
    .where(sql`${tags.parentTagId} IS NULL`)
    .orderBy(asc(tags.name));
}

export async function listTagsByRoot(rootTagId: number) {
  const descendantIds = db
    .select({ id: tagClosure.descendantId })
    .from(tagClosure)
    .where(and(eq(tagClosure.ancestorId, rootTagId), sql`${tagClosure.depth} > 0`));

  return db
    .select({
      id: tags.id,
      parentTagId: tags.parentTagId,
      name: tags.name,
      slug: tags.slug,
    })
    .from(tags)
    .where(inArray(tags.id, descendantIds))
    .orderBy(asc(tags.name));
}

export async function listAllTags() {
  return db
    .select({
      id: tags.id,
      parentTagId: tags.parentTagId,
      name: tags.name,
      slug: tags.slug,
    })
    .from(tags)
    .orderBy(asc(tags.name));
}

export async function getTagById(tagId: number) {
  const [tag] = await db.select().from(tags).where(eq(tags.id, tagId));
  return tag ?? null;
}

export async function getTagBySlug(slug: string) {
  const [tag] = await db.select().from(tags).where(eq(tags.slug, slug));
  return tag ?? null;
}

/**
 * 태그에 속한 공개 포스트 조회 (스펙 5장).
 * includeDescendants는 저장 속성이 아니라 뷰 옵션 — TagClosure로 하위 태그 전체 포함.
 */
export async function listPostsByTag(tagId: number, includeDescendants: boolean) {
  const tagIdsQuery = includeDescendants
    ? db
        .select({ id: tagClosure.descendantId })
        .from(tagClosure)
        .where(eq(tagClosure.ancestorId, tagId))
    : db.select({ id: tags.id }).from(tags).where(eq(tags.id, tagId));

  const rows = await db
    .selectDistinct({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      summary: posts.summary,
      contentMd: posts.contentMd,
    })
    .from(posts)
    .innerJoin(postTags, eq(postTags.postId, posts.id))
    .where(and(inArray(postTags.tagId, tagIdsQuery), eq(posts.unlisted, false)))
    .orderBy(desc(posts.createdAt));
  return withListSummary(rows);
}

/** 태그별 포스트 수 (하위 포함). 태그 목록 페이지용 */
export async function countPostsByTags(tagIds: number[]) {
  if (tagIds.length === 0) return new Map<number, number>();
  const rows = await db
    .select({
      ancestorId: tagClosure.ancestorId,
      count: sql<number>`count(distinct ${postTags.postId})::int`,
    })
    .from(tagClosure)
    .innerJoin(postTags, eq(postTags.tagId, tagClosure.descendantId))
    .where(inArray(tagClosure.ancestorId, tagIds))
    .groupBy(tagClosure.ancestorId);
  return new Map(rows.map((r) => [r.ancestorId, r.count]));
}

// ---------- 시리즈 ----------

export async function listSeries() {
  return db
    .select({
      id: series.id,
      name: series.name,
      slug: series.slug,
      description: series.description,
      isCompleted: series.isCompleted,
    })
    .from(series)
    .orderBy(asc(series.name));
}

export async function getSeriesById(id: number) {
  const [row] = await db.select().from(series).where(eq(series.id, id));
  return row ?? null;
}

export async function getSeriesBySlug(slug: string) {
  const [row] = await db.select().from(series).where(eq(series.slug, slug));
  return row ?? null;
}

/**
 * 시리즈 내 포스트를 fractional order 순으로 조회 (스펙 6장).
 * includeUnlisted=false(공개 시리즈 페이지)면 링크 전용 포스트는 빠진다 — 관리 화면에서는 true로 호출.
 */
export async function listSeriesPosts(seriesId: number, includeUnlisted: boolean) {
  return db
    .select({
      postId: posts.id,
      title: posts.title,
      slug: posts.slug,
      order: postSeries.order,
    })
    .from(postSeries)
    .innerJoin(posts, eq(postSeries.postId, posts.id))
    .where(
      includeUnlisted
        ? eq(postSeries.seriesId, seriesId)
        : and(eq(postSeries.seriesId, seriesId), eq(posts.unlisted, false)),
    )
    .orderBy(asc(postSeries.order));
}

/** 포스트가 속한 시리즈들 (뷰어의 시리즈 내비게이션용) */
export async function listSeriesOfPost(postId: number) {
  return db
    .select({
      seriesId: series.id,
      name: series.name,
      slug: series.slug,
      isCompleted: series.isCompleted,
    })
    .from(postSeries)
    .innerJoin(series, eq(postSeries.seriesId, series.id))
    .where(eq(postSeries.postId, postId))
    .orderBy(asc(series.name));
}

/** 임베드 카드용 시리즈 메타데이터 일괄 조회 */
export async function listSeriesByIds(ids: number[]) {
  const normalized = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (normalized.length === 0) return [];

  return db
    .select({
      id: series.id,
      name: series.name,
      slug: series.slug,
      description: series.description,
      isCompleted: series.isCompleted,
    })
    .from(series)
    .where(inArray(series.id, normalized));
}

/**
 * 임베드 카드(::series{id=...})용 시리즈-포스트 목록 일괄 조회 (fractional order 정렬).
 * includeUnlisted=false(공개 포스트 본문에 렌더될 때)면 링크 전용 포스트는 카드에서 빠진다 —
 * 에디터 미리보기는 true로 호출.
 */
export async function listSeriesPostsBySeriesIds(seriesIds: number[], includeUnlisted: boolean) {
  const normalized = [...new Set(seriesIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (normalized.length === 0) return [];

  return db
    .select({
      seriesId: postSeries.seriesId,
      postId: posts.id,
      title: posts.title,
      slug: posts.slug,
      order: postSeries.order,
    })
    .from(postSeries)
    .innerJoin(posts, eq(postSeries.postId, posts.id))
    .where(
      includeUnlisted
        ? inArray(postSeries.seriesId, normalized)
        : and(inArray(postSeries.seriesId, normalized), eq(posts.unlisted, false)),
    )
    .orderBy(asc(postSeries.seriesId), asc(postSeries.order));
}
