"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import type { ActionResult } from "./tags";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateSiteSettings(
  name: string,
  email: string,
): Promise<ActionResult> {
  await requireAdmin();

  const trimmedName = name.trim();
  if (trimmedName.length === 0) return { ok: false, error: "블로그 이름을 입력해 주세요." };
  if (trimmedName.length > 100) {
    return { ok: false, error: "블로그 이름은 100자를 넘을 수 없습니다." };
  }

  const trimmedEmail = email.trim();
  if (trimmedEmail !== "" && !EMAIL_PATTERN.test(trimmedEmail)) {
    return { ok: false, error: "이메일 형식이 올바르지 않습니다." };
  }

  await db
    .insert(settings)
    .values([
      { key: "site_name", value: trimmedName },
      // 빈 값 저장 = 푸터에서 이메일 숨김
      { key: "site_email", value: trimmedEmail },
    ])
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: sql`excluded.value` },
    });

  // 헤더/푸터/메타데이터는 루트 레이아웃에 있으므로 전체 무효화
  revalidatePath("/", "layout");
  return { ok: true };
}
