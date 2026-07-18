"use server";

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, type Tx } from "@/lib/db";
import { postTags, tagClosure, tags } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { slugFromTitle, validateSlug } from "@/lib/domain/slug";
import {
  canDeleteTag,
  closureRowsForNewTag,
  closureRowsForReparent,
  wouldCreateCycle,
} from "@/lib/domain/tag-closure";

export type ActionResult = { ok: true } | { ok: false; error: string };

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code =
    (err as { code?: string }).code ??
    (err as { cause?: { code?: string } }).cause?.code;
  return code === "23505";
}

function revalidateTagPages() {
  revalidatePath("/admin/tags");
  revalidatePath("/tags");
}

// ---------- 태그 ----------

/** parent의 조상 체인(self 포함)을 closure에서 조회 */
async function ancestorsOf(tx: Tx, tagId: number) {
  return tx
    .select({ ancestorId: tagClosure.ancestorId, depth: tagClosure.depth })
    .from(tagClosure)
    .where(eq(tagClosure.descendantId, tagId));
}

export async function createTag(
  parentTagId: number | null,
  name: string,
  slug?: string,
): Promise<ActionResult> {
  await requireAdmin();
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, error: "이름을 입력해 주세요." };

  try {
    await db.transaction(async (tx) => {
      let parentSlug = "";
      if (parentTagId !== null) {
        const [parent] = await tx.select().from(tags).where(eq(tags.id, parentTagId));
        if (!parent) throw new Error("부모 태그가 존재하지 않습니다.");
        parentSlug = parent.slug;
      }

      let finalSlug: string;
      if (slug && slug.trim()) {
        const val = validateSlug(slug, []);
        if (!val.ok) throw new Error("유효하지 않은 슬러그입니다.");
        finalSlug = val.slug;
      } else {
        const baseSlug = slugFromTitle(trimmed);
        finalSlug = parentTagId !== null ? `${parentSlug}-${baseSlug}` : baseSlug;
      }

      const [inserted] = await tx
        .insert(tags)
        .values({ parentTagId, name: trimmed, slug: finalSlug })
        .returning({ id: tags.id });

      const parentAncestors = parentTagId !== null ? await ancestorsOf(tx, parentTagId) : [];
      await tx.insert(tagClosure).values(closureRowsForNewTag(inserted.id, parentAncestors));
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      if ((err as any).constraint === "tag_slug_unique") {
        return { ok: false, error: "이미 존재하는 슬러그입니다." };
      }
      return { ok: false, error: "같은 부모 아래 동일한 이름의 태그가 이미 있습니다." };
    }
    if (err instanceof Error) return { ok: false, error: err.message };
    throw err;
  }
  revalidateTagPages();
  return { ok: true };
}

export async function renameTag(tagId: number, name: string, slug?: string): Promise<ActionResult> {
  await requireAdmin();
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, error: "이름을 입력해 주세요." };

  let patch: { name: string; slug?: string } = { name: trimmed };
  if (slug && slug.trim()) {
    const val = validateSlug(slug, []);
    if (!val.ok) return { ok: false, error: "유효하지 않은 슬러그입니다." };
    patch.slug = val.slug;
  }

  try {
    await db.update(tags).set(patch).where(eq(tags.id, tagId));
  } catch (err) {
    if (isUniqueViolation(err)) {
      if ((err as any).constraint === "tag_slug_unique") {
        return { ok: false, error: "이미 존재하는 슬러그입니다." };
      }
      return { ok: false, error: "같은 부모 아래 동일한 이름의 태그가 이미 있습니다." };
    }
    throw err;
  }
  revalidateTagPages();
  return { ok: true };
}

/**
 * 태그 이동(재부모화, 스펙 5장): 같은 네임스페이스 내에서만,
 * 순환 참조는 TagClosure로 검사 후 거부, 동일 이름 형제는 unique 제약이 거부.
 */
export async function moveTag(tagId: number, newParentId: number | null): Promise<ActionResult> {
  await requireAdmin();
  try {
    await db.transaction(async (tx) => {
      const [tag] = await tx.select().from(tags).where(eq(tags.id, tagId));
      if (!tag) throw new Error("태그가 존재하지 않습니다.");

      if (newParentId !== null) {
        const [parent] = await tx.select().from(tags).where(eq(tags.id, newParentId));
        if (!parent) throw new Error("새 부모 태그가 존재하지 않습니다.");
      }

      // 순환 검사: 새 부모가 자신 또는 자신의 자손이면 거부
      const subtree = await tx
        .select({ descendantId: tagClosure.descendantId, depth: tagClosure.depth })
        .from(tagClosure)
        .where(eq(tagClosure.ancestorId, tagId));
      const descendantIds = new Set(
        subtree.filter((r) => r.descendantId !== tagId).map((r) => r.descendantId),
      );
      if (wouldCreateCycle(tagId, newParentId, descendantIds)) {
        throw new Error("자기 자신이나 하위 태그 아래로는 이동할 수 없습니다.");
      }

      // 서브트리 외부 조상과의 기존 closure 행 제거
      const subtreeIds = subtree.map((r) => r.descendantId);
      await tx
        .delete(tagClosure)
        .where(
          and(
            inArray(tagClosure.descendantId, subtreeIds),
            notInArray(tagClosure.ancestorId, subtreeIds),
          ),
        );

      // 새 부모의 조상 체인 × 서브트리 조합으로 재연결
      if (newParentId !== null) {
        const newParentAncestors = await ancestorsOf(tx, newParentId);
        const rows = closureRowsForReparent(newParentAncestors, subtree);
        if (rows.length > 0) await tx.insert(tagClosure).values(rows);
      }

      await tx.update(tags).set({ parentTagId: newParentId }).where(eq(tags.id, tagId));
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "이동할 위치에 동일한 이름의 형제 태그가 이미 있습니다." };
    }
    if (err instanceof Error) return { ok: false, error: err.message };
    throw err;
  }
  revalidateTagPages();
  return { ok: true };
}

/** 태그 삭제 (스펙 5장): depth=1 자식이 하나라도 있으면 금지 */
export async function deleteTag(tagId: number): Promise<ActionResult> {
  await requireAdmin();
  try {
    await db.transaction(async (tx) => {
      const [{ childCount }] = await tx
        .select({ childCount: sql<number>`count(*)::int` })
        .from(tagClosure)
        .where(and(eq(tagClosure.ancestorId, tagId), eq(tagClosure.depth, 1)));
      if (!canDeleteTag(childCount)) {
        throw new Error("하위 태그가 있는 태그는 삭제할 수 없습니다. 하위 태그를 먼저 정리해 주세요.");
      }
      await tx.delete(tags).where(eq(tags.id, tagId));
    });
  } catch (err) {
    if (err instanceof Error) return { ok: false, error: err.message };
    throw err;
  }
  revalidateTagPages();
  return { ok: true };
}

// ---------- 포스트-태그 연결 ----------

export async function setPostTags(postId: number, tagIds: number[]): Promise<ActionResult> {
  await requireAdmin();
  if (tagIds.length > 0) {
    const rootTags = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(inArray(tags.id, tagIds), sql`${tags.parentTagId} IS NULL`));
    if (rootTags.length > 0) {
      return { ok: false, error: "최상위 태그(루트 태그)는 포스트에 할당할 수 없습니다." };
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(postTags).where(eq(postTags.postId, postId));
    if (tagIds.length > 0) {
      await tx.insert(postTags).values(tagIds.map((tagId) => ({ postId, tagId })));
    }
  });
  revalidatePath("/admin/posts");
  return { ok: true };
}
