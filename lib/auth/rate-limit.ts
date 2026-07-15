/**
 * 로그인 브루트포스 방어용 인메모리 레이트리밋.
 * 단일 인스턴스(단일 컨테이너) 전제 — 다중 인스턴스로 확장 시 Redis 등으로 교체.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15분
const MAX_FAILURES = 5;

interface Entry {
  count: number;
  resetAt: number;
}

const failures = new Map<string, Entry>();

function prune(now: number): void {
  for (const [key, entry] of failures) {
    if (entry.resetAt <= now) failures.delete(key);
  }
}

/** 잠금 상태면 남은 초를, 아니면 null을 반환 */
export function lockedForSeconds(key: string): number | null {
  const now = Date.now();
  prune(now);
  const entry = failures.get(key);
  if (!entry || entry.count < MAX_FAILURES) return null;
  return Math.ceil((entry.resetAt - now) / 1000);
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearLoginFailures(key: string): void {
  failures.delete(key);
}
