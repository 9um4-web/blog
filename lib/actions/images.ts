"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { images } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import type { ActionResult } from "./tags";

/**
 * 이미지 삭제. 본문에서 참조 중인지는 검사하지 않는다 —
 * 참조가 남아 있으면 해당 위치가 깨진 이미지로 보일 뿐이며, UI에서 경고한다.
 */
export async function deleteImage(id: number): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(images).where(eq(images.id, id));
  revalidatePath("/admin/images");
  return { ok: true };
}
