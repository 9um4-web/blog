/**
 * 헤더 내비게이션 항목 (순수 도메인 로직, Next 비의존).
 *
 * 저장 형식: setting 테이블의 "nav_items" 키에 JSON 배열로 저장된
 * StoredNavEntry[] (표시 순서 = 배열 순서, on/off는 enabled 필드).
 * 기본 제공 페이지(글목록/태그/시리즈/방명록) + 시리즈별 항목을 하나의
 * 순서 공간에서 같이 관리한다 — 드롭다운이 아니라 헤더에 나란히 뜨는
 * 평범한 링크들이다.
 */

export interface StoredNavEntry {
  id: string;
  enabled: boolean;
}

export interface NavItem {
  id: string;
  label: string;
  href: string;
  enabled: boolean;
}

interface SeriesRef {
  id: number;
  slug: string;
  name: string;
}

/** 기본 제공 페이지. id는 "builtin:<key>" 형태로 시리즈 항목("series:<id>")과 구분한다. */
export const BUILTIN_NAV_ITEMS: ReadonlyArray<{ id: string; label: string; href: string }> = [
  { id: "builtin:posts", label: "글 목록", href: "/posts" },
  { id: "builtin:tags", label: "태그", href: "/tags" },
  { id: "builtin:series", label: "시리즈", href: "/series" },
  { id: "builtin:guestbook", label: "방명록", href: "/guestbook" },
];

export function seriesNavId(seriesId: number): string {
  return `series:${seriesId}`;
}

function resolveSeriesId(id: string): number | null {
  const match = /^series:(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

/**
 * 저장된 순서/on-off 목록과 현재 시리즈 목록을 합쳐 화면에 뿌릴 전체 목록을 만든다.
 * - 저장된 항목 중 삭제된 시리즈를 가리키는 건 조용히 빠진다.
 * - 저장된 목록에 없는 새 항목(신규 시리즈, 혹은 최초 실행 시 builtin 전체)은
 *   끝에 자동으로 추가된다 — builtin은 기본 on, 시리즈는 기본 off.
 * - 반환값은 disabled 항목도 포함한 "전체" 목록이다(관리자 화면용).
 *   공개 헤더에 실제로 그릴 때는 이 중 enabled인 것만 걸러 쓴다.
 */
export function mergeNavItems(
  stored: StoredNavEntry[],
  seriesList: SeriesRef[],
): NavItem[] {
  const seriesById = new Map(seriesList.map((s) => [s.id, s]));
  const seenIds = new Set<string>();
  const result: NavItem[] = [];

  for (const entry of stored) {
    if (seenIds.has(entry.id)) continue; // 저장 데이터 중복 방어

    const builtin = BUILTIN_NAV_ITEMS.find((b) => b.id === entry.id);
    if (builtin) {
      result.push({ ...builtin, enabled: entry.enabled });
      seenIds.add(entry.id);
      continue;
    }

    const seriesId = resolveSeriesId(entry.id);
    if (seriesId !== null) {
      const s = seriesById.get(seriesId);
      if (s) {
        result.push({
          id: entry.id,
          label: s.name,
          href: `/series/${s.slug}`,
          enabled: entry.enabled,
        });
        seenIds.add(entry.id);
      }
      // 삭제된 시리즈를 가리키던 저장 항목은 자연히 드롭됨
    }
  }

  for (const builtin of BUILTIN_NAV_ITEMS) {
    if (!seenIds.has(builtin.id)) {
      result.push({ ...builtin, enabled: true });
      seenIds.add(builtin.id);
    }
  }

  for (const s of seriesList) {
    const id = seriesNavId(s.id);
    if (!seenIds.has(id)) {
      result.push({ id, label: s.name, href: `/series/${s.slug}`, enabled: false });
      seenIds.add(id);
    }
  }

  return result;
}

export function serializeNavItems(items: NavItem[]): StoredNavEntry[] {
  return items.map((item) => ({ id: item.id, enabled: item.enabled }));
}

/** id의 enabled만 뒤집은 새 배열을 반환 (불변) */
export function toggleNavItem(items: NavItem[], id: string, enabled: boolean): NavItem[] {
  return items.map((item) => (item.id === id ? { ...item, enabled } : item));
}

/**
 * id를 인접 항목과 맞바꾼 새 배열을 반환 (불변). 이미 맨 끝이면 원본과
 * 동일한 배열을 반환한다 — enabled 여부와 무관하게 전체 목록 안에서 이동한다.
 */
export function moveNavItem(items: NavItem[], id: string, direction: "up" | "down"): NavItem[] {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return items;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return items;

  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
