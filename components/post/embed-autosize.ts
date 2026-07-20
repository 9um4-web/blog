/**
 * SNS embed iframe 자동 높이 조절.
 *
 * X/Instagram/Bluesky embed 페이지는 렌더 완료 후 부모 창으로 실제 콘텐츠
 * 높이를 postMessage로 알려준다. 그 메시지를 수신해 해당 iframe과
 * 래퍼(.embed-widget)의 높이를 실측값으로 맞춘다.
 * (SSR 시점의 고정 fallback 높이는 CLS 방지용 초기값 역할만 한다.)
 *
 * 설계 노트:
 * - 리스너는 모듈 평가 시점에 창 전체에 1개만 등록한다. iframe은 SSR HTML로
 *   JS 번들보다 먼저 로드되므로, React 하이드레이션(useEffect) 이전에 도착한
 *   resize 메시지를 놓치지 않도록 최대한 일찍 등록하고, 아직 attach된 root가
 *   없을 때 온 높이는 source별로 버퍼링해뒀다가 attach 시 반영한다.
 * - 메시지 → iframe 매칭은 event.source === iframe.contentWindow 비교로
 *   하므로 embed별 id 관리가 필요 없다.
 */

type HeightExtractor = (data: unknown) => number | null;

/** 비정상 메시지 방어용 상한 (px) */
const MAX_HEIGHT = 10_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * postMessage data → 객체. X와 Instagram은 JSON "문자열"로 보내고
 * Bluesky는 객체로 보낸다 — 양쪽 모두 수용한다.
 */
function toMessageRecord(data: unknown): Record<string, unknown> | null {
  if (typeof data === "string") {
    try {
      return asRecord(JSON.parse(data));
    } catch {
      return null;
    }
  }
  return asRecord(data);
}

function toValidHeight(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n < MAX_HEIGHT
    ? Math.ceil(n)
    : null;
}

/** X: '{"twttr.embed":{"method":"twttr.private.resize","params":[{"height":N}]}}' (JSON 문자열) */
const extractTwitterHeight: HeightExtractor = (data) => {
  const embed = asRecord(toMessageRecord(data)?.["twttr.embed"]);
  if (!embed || typeof embed.method !== "string" || !embed.method.endsWith("resize")) {
    return null;
  }
  const params = Array.isArray(embed.params) ? embed.params : [];
  return toValidHeight(asRecord(params[0])?.height);
};

/** Instagram: '{"type":"MEASURE","details":{"height":N}}' (JSON 문자열) */
const extractInstagramHeight: HeightExtractor = (data) => {
  const parsed = toMessageRecord(data);
  if (parsed?.type !== "MEASURE") return null;
  return toValidHeight(asRecord(parsed.details)?.height);
};

/** Bluesky: { id, height } (embed.bsky.app 공식 embed.js와 동일한 형식) */
const extractBlueskyHeight: HeightExtractor = (data) => {
  return toValidHeight(toMessageRecord(data)?.height);
};

/**
 * origin → 높이 추출기. 등록된 origin 외 메시지는 전부 무시한다.
 * X는 twitter.com → x.com 도메인 전환 과도기라 양쪽 origin을 모두 받는다.
 */
const PROVIDERS: Record<string, HeightExtractor> = {
  "https://platform.twitter.com": extractTwitterHeight,
  "https://platform.x.com": extractTwitterHeight,
  "https://www.instagram.com": extractInstagramHeight,
  "https://instagram.com": extractInstagramHeight,
  "https://embed.bsky.app": extractBlueskyHeight,
};

// ---------- 전역 리스너 + attach 이전 도착분 버퍼 ----------

const attachedRoots = new Set<HTMLElement>();
const lastHeightBySource = new Map<MessageEventSource, number>();
let listenerStarted = false;

function findIframeBySource(
  root: HTMLElement,
  source: MessageEventSource | null,
): HTMLIFrameElement | null {
  if (!source) return null;
  for (const iframe of root.querySelectorAll<HTMLIFrameElement>(".embed-widget iframe")) {
    if (iframe.contentWindow === source) return iframe;
  }
  return null;
}

function applyHeight(iframe: HTMLIFrameElement, height: number): void {
  iframe.style.height = `${height}px`;
  const wrapper = iframe.closest<HTMLElement>(".embed-widget");
  if (wrapper) {
    // SSR fallback 고정 높이를 해제하고 iframe 실측 높이에 맞춘다
    wrapper.style.height = "auto";
    // Instagram은 로드 초기(스타일 적용 전)에 크게 어긋난 높이를 보내는 경우가
    // 있고 이후 스스로 재측정하지 않는다 — 한 번 폭을 미세하게 흔들어
    // 내부 resize 핸들러의 재측정(MEASURE 재발신)을 유도한다.
    if (wrapper.matches(".instagram-embed") && !iframe.dataset.remeasured) {
      iframe.dataset.remeasured = "1";
      setTimeout(() => {
        iframe.style.width = "calc(100% - 1px)";
        requestAnimationFrame(() => {
          iframe.style.width = "";
        });
      }, 2000);
    }
  }
}

function onMessage(event: MessageEvent): void {
  const extract = PROVIDERS[event.origin];
  if (!extract || !event.source) return;
  const height = extract(event.data);
  if (height === null) return;

  for (const root of attachedRoots) {
    const iframe = findIframeBySource(root, event.source);
    if (iframe) {
      applyHeight(iframe, height);
      return;
    }
  }
  // 아직 attach된 root에 없는 iframe(하이드레이션 전 등) → 버퍼링
  lastHeightBySource.set(event.source, height);
}

function startGlobalListener(): void {
  if (listenerStarted || typeof window === "undefined") return;
  listenerStarted = true;
  window.addEventListener("message", onMessage);
}

// 모듈 평가 즉시 등록 — useEffect보다 이른 시점에 메시지 수신 시작
startGlobalListener();

function flushBufferedHeights(root: HTMLElement): void {
  for (const [source, height] of lastHeightBySource) {
    const iframe = findIframeBySource(root, source);
    if (iframe) {
      applyHeight(iframe, height);
      lastHeightBySource.delete(source);
    }
  }
}

// ---------- 하이드레이션 전에 놓친 메시지 복구 ----------

/**
 * X 등은 resize 메시지를 로드 직후 한 번만 보낸다. SSR iframe이 JS 번들
 * 평가보다 먼저 로드를 끝내면 그 메시지를 영영 놓치므로, attach 후 잠시
 * 기다렸다가 여전히 fallback 높이인 iframe만 한 번 재로드해 재발신을 유도한다.
 * (Instagram처럼 반복 발신하는 provider는 그 사이 적용되어 재로드를 건너뛴다)
 */
const MESSAGE_PROVIDER_SELECTOR =
  ".x-embed iframe, .bluesky-embed iframe, .instagram-embed iframe";
const MISSED_MESSAGE_GRACE_MS = 1500;

function scheduleMissedMessageReload(root: HTMLElement): () => void {
  const timer = setTimeout(() => {
    for (const iframe of root.querySelectorAll<HTMLIFrameElement>(MESSAGE_PROVIDER_SELECTOR)) {
      const wrapper = iframe.closest<HTMLElement>(".embed-widget");
      if (!wrapper || wrapper.style.height === "auto") continue; // 이미 실측 적용됨
      if (iframe.dataset.autosizeReloaded) continue; // 재로드는 1회만
      iframe.dataset.autosizeReloaded = "1";

      let src = iframe.src;
      try {
        const url = new URL(src);
        // 동일 URL 재설정은 브라우저가 리로드하지 않을 수 있다 — 무해한
        // 파라미터를 붙여 실제 네비게이션을 강제한다
        url.searchParams.set("as", String(Date.now() % 100000));
        // 예전에 저장된 bluesky embed HTML에는 id 파라미터가 없어 높이 메시지를
        // 안 보낸다 — 재로드하는 김에 보충한다 (source 매칭이라 값은 무엇이든 무방)
        if (wrapper.matches(".bluesky-embed") && !url.searchParams.has("id")) {
          url.searchParams.set("id", "autosize");
        }
        src = url.toString();
      } catch {
        /* 비정상 src → 그대로 재설정 시도 */
      }
      iframe.setAttribute("src", src);
    }
  }, MISSED_MESSAGE_GRACE_MS);
  return () => clearTimeout(timer);
}

// ---------- Pinterest: 핀 이미지 비율 기반 높이 계산 ----------

/**
 * Pinterest embed는 높이 메시지를 보내지 않는다. 대신 공개 핀 정보 API
 * (pinit.js가 쓰는 pidgets, CORS 허용)로 이미지 크기를 얻어
 * "이미지 높이(폭×비율) + 하단 정보 영역" 으로 계산한다.
 */
const PINTEREST_INFO_URL = "https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=";
/** 핀 카드 하단(작성자 행) 대략 높이 (px) */
const PINTEREST_FOOTER_PX = 100;

/** pinId → 이미지 비율(height/width). 실패는 null로 캐시하지 않고 재시도 허용 */
const pinRatioCache = new Map<string, Promise<number | null>>();

function fetchPinRatio(pinId: string): Promise<number | null> {
  const cached = pinRatioCache.get(pinId);
  if (cached) return cached;

  const promise = fetch(`${PINTEREST_INFO_URL}${encodeURIComponent(pinId)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((json: unknown) => {
      const data = asRecord(json)?.data;
      const pin = asRecord(Array.isArray(data) ? data[0] : null);
      const img = asRecord(asRecord(pin?.images)?.["236x"]);
      const w = img?.width;
      const h = img?.height;
      return typeof w === "number" && typeof h === "number" && w > 0 && h > 0 ? h / w : null;
    })
    .catch(() => null)
    .then((ratio) => {
      if (ratio === null) pinRatioCache.delete(pinId); // 실패 시 다음 기회에 재시도
      return ratio;
    });
  pinRatioCache.set(pinId, promise);
  return promise;
}

function sizePinterest(wrapper: HTMLElement, ratio: number): void {
  const iframe = wrapper.querySelector<HTMLIFrameElement>("iframe");
  if (!iframe) return;
  const width = wrapper.clientWidth;
  if (width <= 0) return;
  iframe.style.height = `${Math.round(width * ratio) + PINTEREST_FOOTER_PX}px`;
  wrapper.style.height = "auto";
}

function attachPinterest(root: HTMLElement): (() => void) | null {
  const wrappers = root.querySelectorAll<HTMLElement>(".pinterest-embed");
  if (wrappers.length === 0) return null;

  // 폭이 %(반응형)일 수 있으므로 폭 변화 시 높이 재계산
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const wrapper = entry.target as HTMLElement;
      const ratio = Number(wrapper.dataset.pinRatio);
      if (ratio > 0) sizePinterest(wrapper, ratio);
    }
  });

  for (const wrapper of wrappers) {
    const src = wrapper.querySelector("iframe")?.src ?? "";
    let pinId: string | null = null;
    try {
      pinId = new URL(src).searchParams.get("id");
    } catch {
      /* src 없음/비정상 → 건너뜀 */
    }
    if (!pinId) continue;

    void fetchPinRatio(pinId).then((ratio) => {
      if (ratio === null || !wrapper.isConnected) return;
      wrapper.dataset.pinRatio = String(ratio);
      sizePinterest(wrapper, ratio);
      observer.observe(wrapper);
    });
  }
  return () => observer.disconnect();
}

// ---------- 공개 API ----------

/**
 * root 내부 embed iframe들의 자동 높이 조절을 시작한다.
 * @returns 해제 함수 (useEffect cleanup용)
 */
export function attachEmbedAutosize(root: HTMLElement): () => void {
  startGlobalListener();
  attachedRoots.add(root);
  flushBufferedHeights(root);
  const cancelReload = scheduleMissedMessageReload(root);
  const stopPinterest = attachPinterest(root);

  return () => {
    attachedRoots.delete(root);
    cancelReload();
    stopPinterest?.();
  };
}
