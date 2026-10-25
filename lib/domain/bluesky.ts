/**
 * Bluesky 핸들 → DID 해석. 임베드 자체(`![](https://bsky.app/profile/…/post/…)`)는 @gogum4/editor-schema의 공급자이고,
 * embed.bsky.app은 DID만 받으므로 핸들 주소는 렌더 전에 DID로 알아내 둔다(remark 방문자는 동기라 fetch를 못 한다).
 */

const BLUESKY_DID_PATTERN = /^did:[a-z]+:[A-Za-z0-9._:%-]+$/;
/** 본문 전체에서 bluesky 핸들만 미리 수집할 때 쓰는 스캔용 패턴 */
const BLUESKY_HANDLE_SCAN = /bsky\.app\/profile\/([^/\s\]}()]+)\/post\//gi;

/**
 * handle → DID 해석 결과 캐시 (프로세스 수명).
 * 에디터 미리보기는 타이핑마다 재렌더되므로 캐시가 없으면 매번 네트워크를 탄다.
 * 실패(null)는 캐시하지 않아 다음 렌더에서 재시도한다.
 */
const blueskyDidCache = new Map<string, string>();

export async function resolveBlueskyDid(handle: string): Promise<string | null> {
  const key = handle.toLowerCase();
  const cached = blueskyDidCache.get(key);
  if (cached) return cached;
  try {
    const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const did = (data as { did?: unknown }).did;
    if (typeof did !== "string" || !BLUESKY_DID_PATTERN.test(did)) return null;
    blueskyDidCache.set(key, did);
    return did;
  } catch {
    return null;
  }
}

/** 본문에 등장하는 bluesky 핸들들(소문자)을 DID로 미리 해석한다. 못 알아낸 핸들은 표에서 빠진다. */
export async function resolveBlueskyDids(contentMd: string): Promise<ReadonlyMap<string, string>> {
  const handles = new Set<string>();
  for (const match of contentMd.matchAll(BLUESKY_HANDLE_SCAN)) {
    const handle = match[1].toLowerCase();
    if (!BLUESKY_DID_PATTERN.test(handle)) handles.add(handle);
  }
  if (handles.size === 0) return new Map();

  const entries = await Promise.all([...handles].map(async (handle) => [handle, await resolveBlueskyDid(handle)] as const));
  return new Map(entries.filter((entry): entry is [string, string] => entry[1] !== null));
}
