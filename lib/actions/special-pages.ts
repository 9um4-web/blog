"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { posts, specialPages } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { SLUG_MAX_LENGTH } from "@/lib/domain/slug";
import type { ActionResult } from "./tags";

// key는 slug와 동일 규칙: 영문 소문자/숫자/하이픈 (스펙 8장)
const KEY_PATTERN = /^[a-z0-9-]+$/;

function revalidateSpecialPages(key: string) {
  revalidatePath("/");
  revalidatePath(`/page/${key}`);
  revalidatePath("/admin/special-pages");
}

/** 같은 key 재배정은 post_id UPSERT (스펙 8장) */
export async function assignSpecialPage(
  key: string,
  postId: number,
  label: string | null,
): Promise<ActionResult> {
  await requireAdmin();

  const normalized = key.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length > SLUG_MAX_LENGTH ||
    !KEY_PATTERN.test(normalized)
  ) {
    return { ok: false, error: "key는 영문 소문자/숫자/하이픈, 최대 100자입니다." };
  }

  const [post] = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId));
  if (!post) return { ok: false, error: "존재하지 않는 포스트입니다." };

  await db
    .insert(specialPages)
    .values({ key: normalized, postId, label })
    .onConflictDoUpdate({
      target: specialPages.key,
      set: { postId, label },
    });

  revalidateSpecialPages(normalized);
  return { ok: true };
}

/** 슬롯 해제. 해제 후에는 해당 포스트 삭제도 가능해진다 (스펙 8장) */
export async function unassignSpecialPage(key: string): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(specialPages).where(eq(specialPages.key, key));
  revalidateSpecialPages(key);
  return { ok: true };
}
