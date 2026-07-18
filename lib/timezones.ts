/** 사이트 표시 타임존 선택지 (IANA 타임존 DB 이름) */

export const TIMEZONE_OPTIONS = [
  { value: "Asia/Seoul", label: "서울 (UTC+9)" },
  { value: "UTC", label: "UTC (UTC+0)" },
  { value: "Asia/Tokyo", label: "도쿄 (UTC+9)" },
  { value: "Asia/Shanghai", label: "상하이 (UTC+8)" },
  { value: "Asia/Singapore", label: "싱가포르 (UTC+8)" },
  { value: "Europe/London", label: "런던 (UTC+0/+1)" },
  { value: "Europe/Paris", label: "파리 (UTC+1/+2)" },
  { value: "America/New_York", label: "뉴욕 (UTC-5/-4)" },
  { value: "America/Los_Angeles", label: "로스앤젤레스 (UTC-8/-7)" },
  { value: "Australia/Sydney", label: "시드니 (UTC+10/+11)" },
] as const;

export const DEFAULT_TIMEZONE = "Asia/Seoul";

export function isTimezoneValue(v: string): boolean {
  return TIMEZONE_OPTIONS.some((o) => o.value === v);
}
