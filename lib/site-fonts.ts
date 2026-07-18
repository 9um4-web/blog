/** 사이트 글꼴 선택지 (순수 상수 — next/font 비의존, 서버 액션/클라이언트 공용) */

export const FONT_OPTIONS = [
  { value: "system", label: "시스템 기본" },
  { value: "geist", label: "Geist (기본값)" },
  { value: "pretendard", label: "Pretendard" },
  { value: "noto-sans-kr", label: "Noto Sans KR" },
  { value: "nanum-gothic", label: "나눔고딕" },
] as const;

export type FontValue = (typeof FONT_OPTIONS)[number]["value"];

export function isFontValue(v: string): v is FontValue {
  return FONT_OPTIONS.some((o) => o.value === v);
}
