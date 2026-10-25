import type { EmbedData } from "./embeds";

/**
 * Bluesky 임베드 (`![](https://bsky.app/profile/핸들/post/글id)`). @gogum4/editor-schema의 외부 임베드 목록에 없는 블로그 전용 공급자다.
 * embed.bsky.app은 DID만 받으므로 핸들이면 렌더 전에 DID로 해석해 둔다(remark 방문자는 동기라 fetch를 못 한다).
 */

const BLUESKY_URL_PATTERN = /^https?:\/\/bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/i;
const BLUESKY_DID_PATTERN = /^did:[a-z]+:[A-Za-z0-9._:%-]+$/;
/** 본문 전체에서 bluesky 핸들만 미리 수집할 때 쓰는 스캔용 패턴 */
const BLUESKY_HANDLE_SCAN = /bsky\.app\/profile\/([^/\s\]}()]+)\/post\//gi;

/**
 * handle → DID 해석 결과 캐시 (프로세스 수명).
 * 에디터 미리보기는 타이핑마다 재렌더되므로 캐시가 없으면 매번 네트워크를 탄다.
 * 실패(null)는 캐시하지 않아 다음 렌더에서 재시도한다.
 */
const blueskyDidCache = new Map<string, string>();

async function resolveBlueskyDid(handle: string): Promise<string | null> {
  const cached = blueskyDidCache.get(handle);
  if (cached) return cached;
  try {
    const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const did = (data as { did?: unknown }).did;
    if (typeof did !== "string" || !BLUESKY_DID_PATTERN.test(did)) return null;
    blueskyDidCache.set(handle, did);
    return did;
  } catch {
    return null;
  }
}

/** 본문에 등장하는 bluesky 핸들들을 DID로 미리 해석한다. */
export async function resolveBlueskyDids(contentMd: string): Promise<ReadonlyMap<string, string>> {
  const handles = new Set<string>();
  for (const match of contentMd.matchAll(BLUESKY_HANDLE_SCAN)) {
    const handle = match[1];
    if (!BLUESKY_DID_PATTERN.test(handle)) handles.add(handle);
  }
  if (handles.size === 0) return new Map();

  const entries = await Promise.all([...handles].map(async (handle) => [handle, await resolveBlueskyDid(handle)] as const));
  return new Map(entries.filter((entry): entry is [string, string] => entry[1] !== null));
}

export function isBlueskyUrl(url: string): boolean {
  return BLUESKY_URL_PATTERN.test(url.trim());
}

const errorData = (text: string): EmbedData => ({ hName: "p", hProperties: {}, hChildren: [{ type: "text", value: text }] });

export function blueskyEmbed(url: string, dids: ReadonlyMap<string, string>, width?: number, height?: number): EmbedData {
  const match = BLUESKY_URL_PATTERN.exec(url.trim());
  if (!match) return errorData("[bluesky: 잘못된 URL]");
  const handle = match[1];
  const rkey = match[2];
  if (!/^[A-Za-z0-9._-]+$/.test(rkey)) return errorData("[bluesky: 잘못된 URL]");

  const did = BLUESKY_DID_PATTERN.test(handle) ? handle : dids.get(handle);
  if (!did) return errorData(`[bluesky: ${handle}의 DID를 확인하지 못했습니다]`);

  return {
    hName: "div",
    hProperties: {
      className: ["embed-widget", "bluesky-embed"],
      "data-embed-type": "bluesky",
      "data-src": url.trim(),
      style: `width: ${width !== undefined ? `${width}px` : "100%"}; height: ${height !== undefined ? `${height}px` : "350px"}`,
    },
    hChildren: [
      {
        type: "element",
        tagName: "iframe",
        properties: {
          // 공식 embed.js가 생성하는 iframe 주소 형식 (at-uri에서 at:// 제거).
          // id 파라미터가 있어야 embed 페이지가 부모로 높이 postMessage를 보낸다.
          src: `https://embed.bsky.app/embed/${did}/app.bsky.feed.post/${rkey}?id=${rkey}`,
          title: "Bluesky post",
          frameBorder: "0",
          scrolling: "no",
          style: "width: 100%; height: 100%; border: none;",
        },
        children: [],
      },
    ],
  };
}
