"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import type { ActionResult } from "./tags";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SOCIAL_KEYS = ["github", "x", "soundcloud", "youtube"] as const;
type SocialKey = (typeof SOCIAL_KEYS)[number];

export interface SiteSettingsInput {
  siteName: string;
  siteEmail: string;
  showSummary: boolean;
  social: Record<SocialKey, string>;
  giscus: {
    repo: string;
    repoId: string;
    category: string;
    categoryId: string;
  };
}

/** 빈 값이면 통과(=숨김), 값이 있으면 http(s) URL만 허용 */
function normalizeUrl(raw: string): { ok: true; value: string } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: "" };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false };
    return { ok: true, value: trimmed };
  } catch {
    return { ok: false };
  }
}

export async function updateSiteSettings(input: SiteSettingsInput): Promise<ActionResult> {
  await requireAdmin();

  const trimmedName = input.siteName.trim();
  if (trimmedName.length === 0) return { ok: false, error: "블로그 이름을 입력해 주세요." };
  if (trimmedName.length > 100) {
    return { ok: false, error: "블로그 이름은 100자를 넘을 수 없습니다." };
  }

  const trimmedEmail = input.siteEmail.trim();
  if (trimmedEmail !== "" && !EMAIL_PATTERN.test(trimmedEmail)) {
    return { ok: false, error: "이메일 형식이 올바르지 않습니다." };
  }

  const socialValues: { key: string; value: string }[] = [];
  for (const key of SOCIAL_KEYS) {
    const result = normalizeUrl(input.social[key] ?? "");
    if (!result.ok) {
      return { ok: false, error: `${key} 링크는 http(s):// 로 시작하는 URL이어야 합니다.` };
    }
    socialValues.push({ key: `social_${key}`, value: result.value });
  }

  const giscusRepo = input.giscus.repo.trim();
  if (giscusRepo !== "" && !/^[\w.-]+\/[\w.-]+$/.test(giscusRepo)) {
    return { ok: false, error: "Giscus 저장소는 owner/repo 형식이어야 합니다." };
  }
  const giscusValues = [
    { key: "giscus_repo", value: giscusRepo },
    { key: "giscus_repo_id", value: input.giscus.repoId.trim() },
    { key: "giscus_category", value: input.giscus.category.trim() },
    { key: "giscus_category_id", value: input.giscus.categoryId.trim() },
  ];

  await db
    .insert(settings)
    .values([
      { key: "site_name", value: trimmedName },
      // 빈 값 저장 = 푸터에서 이메일 숨김
      { key: "site_email", value: trimmedEmail },
      { key: "show_summary", value: input.showSummary ? "true" : "false" },
      ...socialValues,
      ...giscusValues,
    ])
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: sql`excluded.value` },
    });

  // 헤더/푸터/메타데이터는 루트 레이아웃에 있으므로 전체 무효화
  revalidatePath("/", "layout");
  return { ok: true };
}
