"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { getNavItems } from "@/lib/db/queries";
import { requireAdmin } from "@/lib/auth/session";
import { moveNavItem, serializeNavItems, toggleNavItem } from "@/lib/nav-items";
import type { ActionResult } from "./tags";

async function persist(items: ReturnType<typeof serializeNavItems>): Promise<void> {
  const value = JSON.stringify(items);
  await db
    .insert(settings)
    .values({ key: "nav_items", value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
  // 헤더는 루트 레이아웃에 있으므로 전체 무효화
  revalidatePath("/", "layout");
  revalidatePath("/admin/navigation");
}

/** 헤더 메뉴 항목 on/off. 순서는 그대로 유지된다. */
export async function setNavItemEnabled(id: string, enabled: boolean): Promise<ActionResult> {
  await requireAdmin();
  const current = await getNavItems();
  await persist(serializeNavItems(toggleNavItem(current, id, enabled)));
  return { ok: true };
}

/** 헤더 메뉴 항목 순서 이동 (on/off 상태와 무관하게 전체 목록 안에서 이동) */
export async function moveNavItemAction(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  await requireAdmin();
  const current = await getNavItems();
  await persist(serializeNavItems(moveNavItem(current, id, direction)));
  return { ok: true };
}
