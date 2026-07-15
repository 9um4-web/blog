"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  clearLoginFailures,
  lockedForSeconds,
  recordLoginFailure,
} from "@/lib/auth/rate-limit";
import { createSession, destroySession } from "@/lib/auth/session";

export interface LoginState {
  error?: string;
}

async function clientKey(): Promise<string> {
  // 리버스 프록시 뒤에서는 x-forwarded-for의 첫 IP, 없으면 단일 버킷
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "direct";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = formData.get("password");
  const nextPath = formData.get("next");

  const key = await clientKey();
  const lockedFor = lockedForSeconds(key);
  if (lockedFor !== null) {
    return {
      error: `로그인 시도가 너무 많습니다. ${Math.ceil(lockedFor / 60)}분 후에 다시 시도해 주세요.`,
    };
  }

  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return { error: "서버에 ADMIN_PASSWORD_HASH가 설정되지 않았습니다." };

  if (typeof password !== "string" || !(await bcrypt.compare(password, hash))) {
    recordLoginFailure(key);
    return { error: "비밀번호가 올바르지 않습니다." };
  }

  clearLoginFailures(key);
  await createSession();

  // open redirect 방지: 내부 /admin 경로만 허용
  const target =
    typeof nextPath === "string" && nextPath.startsWith("/admin") ? nextPath : "/admin";
  redirect(target);
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
