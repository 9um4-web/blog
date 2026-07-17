"use server";

import { and, eq, like, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, type Tx } from "@/lib/db";
import { posts, specialPages } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { parseForSave } from "@/lib/domain/markdown";
import {
  resolveSlugCollision,
  slugFromTitle,
  SYSTEM_RESERVED_SLUGS,
  validateSlug,
  type SlugValidation,
} from "@/lib/domain/slug";

export interface SavePostInput {
  id?: number;
  title: string;
  /** 빈 문자열/null이면 title 기반 자동 생성 */
  slug?: string | null;
  contentMd: string;
  /** 목록 카드용 요약. 비우면 본문 발췌로 대체 표시 */
  summary?: string | null;
}

export type SavePostResult =
  | { ok: true; id: number; slug: string; parseError: string | null }
  | { ok: false; error: string };

const SLUG_ERROR_MESSAGES: Record<Extract<SlugValidation, { ok: false }>["reason"], string> = {
  empty: "슬러그가 비어 있습니다.",
  "too-long": "슬러그는 100자를 넘을 수 없습니다.",
  "invalid-chars": "슬러그는 영문 소문자/숫자/하이픈만 사용할 수 있습니다.",
  reserved: "시스템 예약어 또는 특수 페이지 key와 겹치는 슬러그입니다.",
};

/** slug 예약어 = 시스템 라우트 고정값 + 현재 등록된 SpecialPage.key 전체 (스펙 8장, 동적 조회) */
async function loadReservedKeys(tx: Tx): Promise<string[]> {
  const rows = await tx.select({ key: specialPages.key }).from(specialPages);
  return rows.map((r) => r.key);
}

async function determineSlug(
  tx: Tx,
  input: SavePostInput,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const reserved = await loadReservedKeys(tx);
  const custom = input.slug?.trim() ?? "";

  if (custom !== "") {
    const v = validateSlug(custom, reserved);
    if (!v.ok) return { ok: false, error: SLUG_ERROR_MESSAGES[v.reason] };

    const dup = await tx
      .select({ id: posts.id })
      .from(posts)
      .where(
        input.id !== undefined
          ? and(eq(posts.slug, v.slug), ne(posts.id, input.id))
          : eq(posts.slug, v.slug),
      );
    if (dup.length > 0) return { ok: false, error: "이미 사용 중인 슬러그입니다." };
    return { ok: true, slug: v.slug };
  }

  // 자동 생성: title 기반 + 중복/예약어 회피 suffix (스펙 2장)
  const base = slugFromTitle(input.title);
  const existing = await tx
    .select({ id: posts.id, slug: posts.slug })
    .from(posts)
    .where(like(posts.slug, `${base}%`));
  const taken = new Set<string>();
  for (const row of existing) {
    if (row.slug !== null && row.id !== input.id) taken.add(row.slug);
  }
  for (const key of [...SYSTEM_RESERVED_SLUGS, ...reserved]) taken.add(key);
  return { ok: true, slug: resolveSlugCollision(base, taken) };
}

/**
 * 저장 = 파싱 동기 트랜잭션 (스펙 3장).
 * 파싱 실패 시에도 본문은 저장하되 heading_tree/parsed_at은 이전 값을 유지하고
 * parse_error에만 기록한다.
 */
export async function savePost(input: SavePostInput): Promise<SavePostResult> {
  await requireAdmin();

  const title = input.title.trim();
  if (title.length === 0) return { ok: false, error: "제목을 입력해 주세요." };

  const result = await db.transaction(async (tx): Promise<SavePostResult> => {
    const slugResult = await determineSlug(tx, input);
    if (!slugResult.ok) return slugResult;

    const parsed = parseForSave(input.contentMd);
    const now = new Date();

    const common = {
      title,
      slug: slugResult.slug,
      contentMd: input.contentMd,
      summary: input.summary?.trim() || null,
      updatedAt: now,
    };
    const onSuccess = parsed.ok
      ? { headingTree: parsed.headingTree, parsedAt: now, parseError: null }
      : { parseError: parsed.error };

    let id: number;
    if (input.id !== undefined) {
      const updated = await tx
        .update(posts)
        .set({ ...common, ...onSuccess })
        .where(eq(posts.id, input.id))
        .returning({ id: posts.id });
      if (updated.length === 0) return { ok: false, error: "존재하지 않는 포스트입니다." };
      id = updated[0].id;
    } else {
      const inserted = await tx
        .insert(posts)
        .values({ ...common, ...onSuccess })
        .returning({ id: posts.id });
      id = inserted[0].id;
    }

    return {
      ok: true,
      id,
      slug: slugResult.slug,
      parseError: parsed.ok ? null : parsed.error,
    };
  });

  if (result.ok) {
    revalidatePath("/");
    revalidatePath(`/${result.slug}`);
    revalidatePath("/admin/posts");
  }
  return result;
}

export type DeletePostResult = { ok: true } | { ok: false; error: string };

export async function deletePost(id: number): Promise<DeletePostResult> {
  await requireAdmin();

  // 슬롯에 배정된 포스트는 삭제 불가 (스펙 8장). FK RESTRICT에 맡기지 않고
  // 먼저 조회해서 사용자에게 어느 슬롯인지 알려준다.
  const slots = await db
    .select({ key: specialPages.key })
    .from(specialPages)
    .where(eq(specialPages.postId, id));
  if (slots.length > 0) {
    return {
      ok: false,
      error: `특수 페이지 슬롯(${slots.map((s) => s.key).join(", ")})에 배정된 포스트입니다. 슬롯을 먼저 해제해 주세요.`,
    };
  }

  await db.delete(posts).where(eq(posts.id, id));
  revalidatePath("/");
  revalidatePath("/admin/posts");
  return { ok: true };
}
