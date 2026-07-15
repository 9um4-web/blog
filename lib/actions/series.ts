"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { postSeries, series } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { keyAfter, keyBetween } from "@/lib/domain/ordering";
import type { ActionResult } from "./tags";

function revalidateSeriesPages() {
  revalidatePath("/admin/series");
  revalidatePath("/series");
}

export async function createSeries(name: string, description: string | null): Promise<ActionResult> {
  await requireAdmin();
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, error: "이름을 입력해 주세요." };
  await db.insert(series).values({ name: trimmed, description });
  revalidateSeriesPages();
  return { ok: true };
}

export async function updateSeries(
  id: number,
  patch: { name?: string; description?: string | null; isCompleted?: boolean },
): Promise<ActionResult> {
  await requireAdmin();
  if (patch.name !== undefined && patch.name.trim().length === 0) {
    return { ok: false, error: "이름을 입력해 주세요." };
  }
  await db
    .update(series)
    .set({ ...patch, name: patch.name?.trim() })
    .where(eq(series.id, id));
  revalidateSeriesPages();
  return { ok: true };
}

/** 시리즈 삭제: PostSeries 행만 CASCADE로 삭제되고 Post는 유지 (스펙 6장) */
export async function deleteSeries(id: number): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(series).where(eq(series.id, id));
  revalidateSeriesPages();
  return { ok: true };
}

/** 시리즈 맨 뒤에 포스트 추가. 동일 포스트 중복 소속은 PK가 거부 (스펙 6장) */
export async function addPostToSeries(postId: number, seriesId: number): Promise<ActionResult> {
  await requireAdmin();
  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ order: postSeries.order })
        .from(postSeries)
        .where(eq(postSeries.seriesId, seriesId))
        .orderBy(asc(postSeries.order));
      const lastKey = rows.length > 0 ? rows[rows.length - 1].order : null;
      await tx.insert(postSeries).values({ postId, seriesId, order: keyAfter(lastKey) });
    });
  } catch (err) {
    const code =
      (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") return { ok: false, error: "이미 이 시리즈에 속한 포스트입니다." };
    if (code === "23503") return { ok: false, error: "포스트 또는 시리즈가 존재하지 않습니다." };
    throw err;
  }
  revalidateSeriesPages();
  return { ok: true };
}

export async function removePostFromSeries(postId: number, seriesId: number): Promise<ActionResult> {
  await requireAdmin();
  await db
    .delete(postSeries)
    .where(and(eq(postSeries.postId, postId), eq(postSeries.seriesId, seriesId)));
  revalidateSeriesPages();
  return { ok: true };
}

/** 에디터용: 포스트의 시리즈 소속을 목표 목록과 동기화 (신규는 맨 뒤에 추가) */
export async function syncPostSeries(postId: number, seriesIds: number[]): Promise<ActionResult> {
  await requireAdmin();
  await db.transaction(async (tx) => {
    const current = await tx
      .select({ seriesId: postSeries.seriesId })
      .from(postSeries)
      .where(eq(postSeries.postId, postId));
    const currentSet = new Set(current.map((r) => r.seriesId));
    const targetSet = new Set(seriesIds);

    for (const seriesId of currentSet) {
      if (!targetSet.has(seriesId)) {
        await tx
          .delete(postSeries)
          .where(and(eq(postSeries.postId, postId), eq(postSeries.seriesId, seriesId)));
      }
    }
    for (const seriesId of targetSet) {
      if (!currentSet.has(seriesId)) {
        const rows = await tx
          .select({ order: postSeries.order })
          .from(postSeries)
          .where(eq(postSeries.seriesId, seriesId))
          .orderBy(asc(postSeries.order));
        const lastKey = rows.length > 0 ? rows[rows.length - 1].order : null;
        await tx.insert(postSeries).values({ postId, seriesId, order: keyAfter(lastKey) });
      }
    }
  });
  revalidateSeriesPages();
  return { ok: true };
}

/**
 * 시리즈 내 포스트 순서 이동 (스펙 6장 fractional order):
 * 이동 대상의 새 키만 이웃 두 키 사이 값으로 갱신, 다른 행은 건드리지 않는다.
 */
export async function movePostInSeries(
  seriesId: number,
  postId: number,
  direction: "up" | "down",
): Promise<ActionResult> {
  await requireAdmin();
  const result = await db.transaction(async (tx): Promise<ActionResult> => {
    const rows = await tx
      .select({ postId: postSeries.postId, order: postSeries.order })
      .from(postSeries)
      .where(eq(postSeries.seriesId, seriesId))
      .orderBy(asc(postSeries.order));

    const index = rows.findIndex((r) => r.postId === postId);
    if (index === -1) return { ok: false, error: "시리즈에 속하지 않은 포스트입니다." };

    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= rows.length) return { ok: true }; // 이미 끝

    // 이동: target 위치의 이웃 사이로 끼워넣기
    const newKey =
      direction === "up"
        ? keyBetween(target - 1 >= 0 ? rows[target - 1].order : null, rows[target].order)
        : keyBetween(rows[target].order, target + 1 < rows.length ? rows[target + 1].order : null);

    await tx
      .update(postSeries)
      .set({ order: newKey })
      .where(and(eq(postSeries.postId, postId), eq(postSeries.seriesId, seriesId)));
    return { ok: true };
  });

  if (result.ok) revalidateSeriesPages();
  return result;
}
