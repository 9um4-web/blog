/** 설정된 사이트 타임존 기준으로 날짜를 포맷하는 헬퍼 (Intl 인스턴스는 timeZone별로 캐시) */

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(opts)}`;
  let fmt = cache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("ko-KR", { ...opts, timeZone });
    cache.set(key, fmt);
  }
  return fmt;
}

export function formatDate(date: Date, timeZone: string): string {
  return formatter(timeZone, { dateStyle: "long" }).format(date);
}

export function formatDateTime(date: Date, timeZone: string): string {
  return formatter(timeZone, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatDateTimeShort(date: Date, timeZone: string): string {
  return formatter(timeZone, { dateStyle: "short", timeStyle: "short" }).format(date);
}
