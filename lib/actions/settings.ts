"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import type { ActionResult } from "./tags";

export async function updateSiteName(name: string): Promise<ActionResult> {
  await requireAdmin();
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, error: "블로그 이름을 입력해 주세요." };
  if (trimmed.length > 100) return { ok: false, error: "블로그 이름은 100자를 넘을 수 없습니다." };

  await db
    .insert(settings)
    .values({ key: "site_name", value: trimmed })
    .onConflictDoUpdate({ target: settings.key, set: { value: trimmed } });

  // 헤더/메타데이터는 루트 레이아웃에 있으므로 전체 무효화
  revalidatePath("/", "layout");
  return { ok: true };
}
