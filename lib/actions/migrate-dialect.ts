"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { posts, series } from "@/lib/db/schema";
import { migrateLegacyDialect } from "@/lib/domain/legacy-dialect";
import { parseForSave } from "@/lib/domain/markdown";

// 예전 블로그 방언(`::youtube`, `:::note` …)으로 쓴 글을 Obsidian 호환 문법으로 한 번 옮기는 관리자 전용 작업이다(변환 규칙은 lib/domain/legacy-dialect.ts).
// 다 옮긴 뒤에는 이 파일·/admin/migrate-dialect 페이지·legacy-dialect.ts를 지워도 된다.

export interface MigrationPreviewRow {
  id: number;
  title: string;
  slug: string | null;
  changed: boolean;
  notices: string[];
  /** 변환 전후 앞부분(변경된 글만) — 눈으로 확인하는 용도. */
  before: string;
  after: string;
}

async function seriesSlugMap(): Promise<Map<number, string>> {
  const rows = await db.select({ id: series.id, slug: series.slug }).from(series);
  return new Map(rows.map((row) => [row.id, row.slug]));
}

const excerpt = (text: string) => (text.length > 600 ? `${text.slice(0, 600)}…` : text);

/** 모든 글을 변환해 보기만 한다(저장하지 않는다). */
export async function previewDialectMigration(): Promise<MigrationPreviewRow[]> {
  await requireAdmin();
  const [rows, seriesSlugById] = await Promise.all([
    db.select({ id: posts.id, title: posts.title, slug: posts.slug, contentMd: posts.contentMd }).from(posts).orderBy(posts.id),
    seriesSlugMap(),
  ]);
  return rows.map((row) => {
    const result = migrateLegacyDialect(row.contentMd, { seriesSlugById });
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      changed: result.changed,
      notices: result.notices,
      before: result.changed ? excerpt(row.contentMd) : "",
      after: result.changed ? excerpt(result.markdown) : "",
    };
  });
}

export type ApplyResult = { ok: true; updated: number; unchanged: number } | { ok: false; error: string };

/** 바뀌는 글만 한 트랜잭션에서 저장한다(목차도 새로 만든다, 수정 시각은 그대로). 이미 옮긴 글은 변하지 않으므로 다시 눌러도 안전하다. */
export async function applyDialectMigration(): Promise<ApplyResult> {
  await requireAdmin();
  try {
    const seriesSlugById = await seriesSlugMap();
    const result = await db.transaction(async (tx) => {
      const rows = await tx.select({ id: posts.id, contentMd: posts.contentMd }).from(posts).orderBy(posts.id);
      let updated = 0;
      for (const row of rows) {
        const migrated = migrateLegacyDialect(row.contentMd, { seriesSlugById });
        if (!migrated.changed) continue;
        const parsed = parseForSave(migrated.markdown);
        const now = new Date();
        await tx
          .update(posts)
          .set({
            contentMd: migrated.markdown,
            ...(parsed.ok ? { headingTree: parsed.headingTree, parsedAt: now, parseError: null } : { parseError: parsed.error }),
          })
          .where(eq(posts.id, row.id));
        updated += 1;
      }
      return { updated, unchanged: rows.length - updated };
    });
    revalidatePath("/", "layout");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
