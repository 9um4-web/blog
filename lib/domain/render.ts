import GithubSlugger from "github-slugger";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { createHighlighter, type Highlighter } from "shiki";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { Element, ElementContent, Root, RootContent } from "hast";
import type { Root as MdastRoot } from "mdast";
import { flattenTransparentContainers } from "./markdown";

const HEADING_TAGS = new Set(["h2", "h3", "h4", "h5", "h6"]);

function textOf(node: Element | ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(textOf).join("");
  return "";
}

function isMermaidPre(node: RootContent | ElementContent): node is Element {
  if (node.type !== "element" || node.tagName !== "pre") return false;
  const code = node.children.find(
    (c): c is Element => c.type === "element" && c.tagName === "code",
  );
  if (!code) return false;
  const className = code.properties?.className;
  return Array.isArray(className) && className.includes("language-mermaid");
}

/**
 * mermaid 코드블록을 lazy render 컨테이너로 변환 (스펙 4.2).
 * 원문 <pre>는 fallback으로 유지 — 클라이언트가 렌더 성공 시 숨기고 SVG를 붙인다.
 * 렌더 실패 시 원문 코드블록이 그대로 노출된다 (스펙 9.2).
 */
function wrapMermaid(node: Element): Element {
  return {
    type: "element",
    tagName: "div",
    properties: { dataMermaid: "", className: ["mermaid-block"] },
    children: [node],
  };
}

/**
 * 최상위 h2~h6를 기준으로 본문을 중첩 <section>으로 래핑.
 * 부모 규칙은 heading_tree와 동일: "직전에 등장한 자신보다 낮은 level의 가장 가까운 헤딩"
 * (스펙 3.4) — 목차(heading_tree)의 id와 본문 앵커 id가 1:1로 일치하게 된다.
 */
function wrapSections(root: Root): void {
  const slugger = new GithubSlugger();
  const result: RootContent[] = [];
  const stack: Array<{ section: Element; level: number }> = [];

  const push = (node: RootContent) => {
    if (stack.length === 0) result.push(node);
    else stack[stack.length - 1].section.children.push(node as ElementContent);
  };

  /**
   * :::fold 블록 재배치: 지정한 레벨 이하의 가장 가까운 조상 섹션의 직속
   * 자식으로 끌어올린다. 뒤에 오는 제목의 섹션은 별도 노드로 생성되므로
   * 끌어올려진 블록이 이후 제목에 접히는 일은 구조적으로 불가능하다.
   * h=none(또는 해당 조상 없음)이면 최상위 열린 섹션에 data-nofold로 붙여
   * 어떤 접기에도 숨겨지지 않게 한다.
   */
  const pushFoldOverride = (node: Element) => {
    const spec = String(node.properties?.dataFold ?? "none");

    if (stack.length === 0) {
      result.push(node);
      return;
    }
    if (spec !== "none") {
      const target = [...stack].reverse().find((entry) => entry.level <= Number(spec));
      if (target) {
        // 현재 위치보다 얕은 조상만 지정 가능. 같은/깊은 값은 기본 동작과 동일
        target.section.children.push(node);
        return;
      }
    }
    node.properties = { ...node.properties, dataNofold: "" };
    stack[0].section.children.push(node);
  };

  for (const child of root.children) {
    const isHeading = child.type === "element" && HEADING_TAGS.has(child.tagName);

    if (!isHeading) {
      if (
        child.type === "element" &&
        child.tagName === "section" &&
        child.properties?.dataFootnotes !== undefined
      ) {
        // GFM 각주 블록(remark-rehype가 문서 끝에 자동 삽입)은 특정 섹션 소속이
        // 아니라 문서 전체에 속하므로, 마지막으로 열린 헤딩 섹션에 먹히지 않게
        // 항상 최상위로 뺀다 — 안 그러면 그 섹션을 접었을 때 각주도 같이 숨는다.
        result.push(child);
      } else if (
        child.type === "element" &&
        child.tagName === "div" &&
        child.properties?.dataFold !== undefined
      ) {
        pushFoldOverride(child);
      } else {
        push(child.type === "element" && isMermaidPre(child) ? wrapMermaid(child) : child);
      }
      continue;
    }

    const heading = child as Element;
    const level = Number(heading.tagName.slice(1));
    const id = slugger.slug(textOf(heading));
    heading.properties = { ...heading.properties, id };

    const section: Element = {
      type: "element",
      tagName: "section",
      properties: {
        className: ["heading-section"],
        dataHeadingId: id,
        dataLevel: String(level),
      },
      children: [heading],
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    if (stack.length === 0) result.push(section);
    else stack[stack.length - 1].section.children.push(section);
    stack.push({ section, level });
  }

  root.children = result;
}

function rehypeSectionWrap() {
  return (tree: Root) => wrapSections(tree);
}

// ---------- 커스텀 디렉티브: ::youtube[영상ID], ::post{slug=...}, ::series{id=...},
// :postlink[표시 텍스트]{slug=...}, :::note ~ ::: ----------

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;
const EMBED_POST_SLUG_PATTERN = /^[a-z0-9-]{1,100}$/;
const EMBED_SERIES_ID_PATTERN = /^[1-9][0-9]*$/;

const TWEET_URL_PATTERN = /^https?:\/\/(www\.)?(twitter|x)\.com\/[^/]+\/status\/(\d+)/i;
const PINTEREST_URL_PATTERN = /^https?:\/\/(www\.)?pinterest\.(com|co\.kr|ca|de|fr|it|ch|es|jp|co\.uk|ru|cl)\/pin\/(\d+)/i;
const BLUESKY_URL_PATTERN = /^https?:\/\/bsky\.app\/profile\/([^/]+)\/post\/([^/]+)/i;
const BLUESKY_DID_PATTERN = /^did:[a-z]+:[A-Za-z0-9._:%-]+$/;
/** 본문 전체에서 bluesky 핸들만 미리 수집할 때 쓰는 스캔용 패턴 */
const BLUESKY_HANDLE_SCAN = /bsky\.app\/profile\/([^/\s\]}]+)\/post\//gi;

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
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
      { signal: AbortSignal.timeout(5000) }
    );
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

/**
 * 본문에 등장하는 bluesky 핸들들을 DID로 미리 해석한다.
 * (remark 방문자는 동기라 fetch를 못 하므로 파이프라인 실행 전에 준비)
 */
async function resolveBlueskyDids(contentMd: string): Promise<ReadonlyMap<string, string>> {
  const handles = new Set<string>();
  for (const match of contentMd.matchAll(BLUESKY_HANDLE_SCAN)) {
    const handle = match[1];
    if (!BLUESKY_DID_PATTERN.test(handle)) handles.add(handle);
  }
  if (handles.size === 0) return new Map();

  const entries = await Promise.all(
    [...handles].map(async (handle) => [handle, await resolveBlueskyDid(handle)] as const)
  );
  return new Map(entries.filter((e): e is [string, string] => e[1] !== null));
}
const SOUNDCLOUD_URL_PATTERN = /^https?:\/\/(www\.)?soundcloud\.com\/[^/]+\/[^/]+/i;
const INSTAGRAM_URL_PATTERN = /^https?:\/\/(www\.)?instagram\.com\/(p|reel)\/([A-Za-z0-9_-]+)/i;

/** 콜아웃 종류 → 기본 제목 */
const CALLOUT_TYPES: Record<string, string> = {
  note: "노트",
  info: "정보",
  tip: "팁",
  warning: "주의",
  danger: "위험",
};

interface DirectiveNode {
  type: "leafDirective" | "containerDirective" | "textDirective";
  name: string;
  attributes?: Record<string, string | null | undefined>;
  children: Array<{ type: string; value?: string; data?: unknown; children?: unknown[] }>;
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
    hChildren?: unknown[];
  };
}

function mdastTextOf(children: Array<{ type: string; value?: string; children?: unknown[] }> | undefined): string {
  if (!children) return "";
  return children
    .map((c) => {
      if (c.type === "text" && typeof c.value === "string") return c.value;
      if (Array.isArray(c.children)) return mdastTextOf(c.children as never);
      return "";
    })
    .join("");
}

function getEmbedStyle(
  attributes: Record<string, string | null | undefined> | undefined,
  defaultWidth?: string,
  defaultHeight?: string,
  defaultAspectRatio?: string
): string {
  if (!attributes) {
    const styles: string[] = [];
    if (defaultWidth) styles.push(`width: ${formatDimension(defaultWidth)}`);
    if (defaultHeight) styles.push(`height: ${formatDimension(defaultHeight)}`);
    if (defaultAspectRatio && !defaultHeight) styles.push(`aspect-ratio: ${defaultAspectRatio}`);
    return styles.join("; ");
  }

  const width = attributes.w ?? attributes.width;
  const height = attributes.h ?? attributes.height;

  const styles: string[] = [];
  if (width) {
    styles.push(`width: ${formatDimension(width)}`);
  } else if (defaultWidth) {
    styles.push(`width: ${formatDimension(defaultWidth)}`);
  }

  if (height) {
    styles.push(`height: ${formatDimension(height)}`);
    if (defaultAspectRatio) {
      styles.push("aspect-ratio: auto");
    }
  } else if (defaultHeight) {
    styles.push(`height: ${formatDimension(defaultHeight)}`);
  } else if (defaultAspectRatio) {
    styles.push(`aspect-ratio: ${defaultAspectRatio}`);
  }

  return styles.join("; ");
}

function youtubeEmbed(node: DirectiveNode): void {
  // ::youtube[dQw4w9WgXcQ] 또는 ::youtube{id=dQw4w9WgXcQ}
  const label = mdastTextOf(node.children).trim();
  const id = node.attributes?.id ?? label;

  if (!id || !YOUTUBE_ID_PATTERN.test(id)) {
    node.data = {
      hName: "p",
      hChildren: [{ type: "text", value: "[youtube: 잘못된 영상 ID]" }],
    };
    return;
  }

  const style = getEmbedStyle(node.attributes, "100%", undefined, "16 / 9");

  // 허용 도메인 고정(youtube-nocookie) — 임의 iframe 주입 불가
  node.data = {
    hName: "div",
    hProperties: {
      className: ["embed-widget", "video-embed"],
      "data-embed-type": "youtube",
      "data-src": id,
      style,
    },
    hChildren: [
      {
        type: "element",
        tagName: "iframe",
        properties: {
          src: `https://www.youtube-nocookie.com/embed/${id}`,
          title: "YouTube video",
          allow:
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
          referrerPolicy: "strict-origin-when-cross-origin",
          allowFullScreen: true,
          loading: "lazy",
        },
        children: [],
      },
    ],
  };
}

function xEmbed(node: DirectiveNode): void {
  const label = mdastTextOf(node.children).trim();
  const url = (node.attributes?.url ?? label).trim();
  const match = TWEET_URL_PATTERN.exec(url);

  if (!match) {
    node.data = {
      hName: "p",
      hChildren: [{ type: "text", value: "[x: 잘못된 URL]" }],
    };
    return;
  }

  const tweetId = match[3];
  const style = getEmbedStyle(node.attributes, "100%", "450px");

  node.data = {
    hName: "div",
    hProperties: {
      className: ["embed-widget", "x-embed"],
      "data-embed-type": "x",
      "data-src": url,
      style,
    },
    hChildren: [
      {
        type: "element",
        tagName: "iframe",
        properties: {
          src: `https://platform.twitter.com/embed/Tweet.html?id=${tweetId}`,
          title: "X post",
          referrerPolicy: "strict-origin-when-cross-origin",
          allowFullScreen: true,
          loading: "lazy",
          style: "width: 100%; height: 100%; border: none;",
        },
        children: [],
      },
    ],
  };
}

function soundcloudEmbed(node: DirectiveNode): void {
  const label = mdastTextOf(node.children).trim();
  const url = (node.attributes?.url ?? label).trim();

  if (!SOUNDCLOUD_URL_PATTERN.test(url)) {
    node.data = {
      hName: "p",
      hChildren: [{ type: "text", value: "[soundcloud: 잘못된 URL]" }],
    };
    return;
  }

  const style = getEmbedStyle(node.attributes, "100%", "166px");

  node.data = {
    hName: "div",
    hProperties: {
      className: ["embed-widget", "soundcloud-embed"],
      "data-embed-type": "soundcloud",
      "data-src": url,
      style,
    },
    hChildren: [
      {
        type: "element",
        tagName: "iframe",
        properties: {
          src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(
            url
          )}&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true`,
          title: "SoundCloud player",
          scrolling: "no",
          frameBorder: "no",
          style: "width: 100%; height: 100%; border: none;",
        },
        children: [],
      },
    ],
  };
}

function instagramEmbed(node: DirectiveNode): void {
  const label = mdastTextOf(node.children).trim();
  const url = (node.attributes?.url ?? label).trim();
  const match = INSTAGRAM_URL_PATTERN.exec(url);

  if (!match) {
    node.data = {
      hName: "p",
      hChildren: [{ type: "text", value: "[instagram: 잘못된 URL]" }],
    };
    return;
  }

  const type = match[2];
  const id = match[3];
  const embedUrl = `https://www.instagram.com/${type}/${id}/embed/captioned/`;
  const style = getEmbedStyle(node.attributes, "100%", "600px");

  node.data = {
    hName: "div",
    hProperties: {
      className: ["embed-widget", "instagram-embed"],
      "data-embed-type": "instagram",
      "data-src": url,
      style,
    },
    hChildren: [
      {
        type: "element",
        tagName: "iframe",
        properties: {
          src: embedUrl,
          title: "Instagram post",
          frameBorder: "0",
          scrolling: "no",
          allowTransparency: true,
          style: "width: 100%; height: 100%; border: 1px solid var(--border); border-radius: calc(var(--radius) + 2px);",
        },
        children: [],
      },
    ],
  };
}

function pinterestEmbed(node: DirectiveNode): void {
  const label = mdastTextOf(node.children).trim();
  const url = (node.attributes?.url ?? label).trim();
  const match = PINTEREST_URL_PATTERN.exec(url);

  if (!match) {
    node.data = {
      hName: "p",
      hChildren: [{ type: "text", value: "[pinterest: 잘못된 URL]" }],
    };
    return;
  }

  const pinId = match[3];
  const style = getEmbedStyle(node.attributes, "345px", "500px");

  node.data = {
    hName: "div",
    hProperties: {
      className: ["embed-widget", "pinterest-embed"],
      "data-embed-type": "pinterest",
      "data-src": url,
      style,
    },
    hChildren: [
      {
        type: "element",
        tagName: "iframe",
        properties: {
          src: `https://assets.pinterest.com/ext/embed.html?id=${pinId}`,
          title: "Pinterest pin",
          frameBorder: "0",
          scrolling: "no",
          style: "width: 100%; height: 100%; border: none;",
        },
        children: [],
      },
    ],
  };
}

function blueskyEmbed(node: DirectiveNode, blueskyDids: ReadonlyMap<string, string>): void {
  const label = mdastTextOf(node.children).trim();
  const url = (node.attributes?.url ?? label).trim();
  const match = BLUESKY_URL_PATTERN.exec(url);

  if (!match) {
    node.data = {
      hName: "p",
      hChildren: [{ type: "text", value: "[bluesky: 잘못된 URL]" }],
    };
    return;
  }

  const handle = match[1];
  const rkey = match[2];

  // embed.bsky.app/embed/은 DID만 받는다 — 핸들이면 미리 해석해둔 DID로 치환
  const did = BLUESKY_DID_PATTERN.test(handle) ? handle : blueskyDids.get(handle);
  if (!did) {
    node.data = {
      hName: "p",
      hChildren: [{ type: "text", value: `[bluesky: ${handle}의 DID를 확인하지 못했습니다]` }],
    };
    return;
  }
  const style = getEmbedStyle(node.attributes, "100%", "350px");

  node.data = {
    hName: "div",
    hProperties: {
      className: ["embed-widget", "bluesky-embed"],
      "data-embed-type": "bluesky",
      "data-src": url,
      style,
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

function videoEmbed(node: DirectiveNode): void {
  const label = mdastTextOf(node.children).trim();
  const url = (node.attributes?.url ?? label).trim();

  if (!url) {
    node.data = {
      hName: "p",
      hChildren: [{ type: "text", value: "[video: 잘못된 URL]" }],
    };
    return;
  }

  const style = getEmbedStyle(node.attributes, "100%", undefined, "16 / 9");

  node.data = {
    hName: "div",
    hProperties: {
      className: ["embed-widget", "video-file-embed"],
      "data-embed-type": "video",
      "data-src": url,
      style,
    },
    hChildren: [
      {
        type: "element",
        tagName: "video",
        properties: {
          src: url,
          controls: true,
          style: "width: 100%; height: 100%; border-radius: calc(var(--radius) + 2px); border: 1px solid var(--border);",
        },
        children: [],
      },
    ],
  };
}

function postEmbed(node: DirectiveNode): void {
  const rawSlug = (node.attributes?.slug ?? "").trim().toLowerCase();

  if (!EMBED_POST_SLUG_PATTERN.test(rawSlug)) {
    node.data = {
      hName: "p",
      hChildren: [{ type: "text", value: "[post: 잘못된 slug]" }],
    };
    return;
  }

  node.data = {
    hName: "div",
    hProperties: {
      className: ["md-embed", "md-embed-post"],
      "data-embed": "post",
      "data-post-slug": rawSlug,
    },
  };
}

function seriesEmbed(node: DirectiveNode): void {
  const rawId = (node.attributes?.id ?? "").trim();

  if (!EMBED_SERIES_ID_PATTERN.test(rawId)) {
    node.data = {
      hName: "p",
      hChildren: [{ type: "text", value: "[series: 잘못된 id]" }],
    };
    return;
  }

  node.data = {
    hName: "div",
    hProperties: {
      className: ["md-embed", "md-embed-series"],
      "data-embed": "series",
      "data-series-id": rawId,
    },
  };
}

function calloutBlock(node: DirectiveNode): void {
  const defaultTitle = CALLOUT_TYPES[node.name];

  node.data = {
    hName: "div",
    hProperties: { className: ["callout", `callout-${node.name}`] },
  };

  // :::note[커스텀 제목] 의 라벨 문단은 directiveLabel로 표시되어 들어온다
  const first = node.children[0] as
    | { data?: { directiveLabel?: boolean; hName?: string; hProperties?: unknown } }
    | undefined;
  if (first?.data && (first.data as { directiveLabel?: boolean }).directiveLabel) {
    first.data.hName = "div";
    first.data.hProperties = { className: ["callout-title"] };
  } else {
    node.children.unshift({
      type: "paragraph",
      data: { hName: "div", hProperties: { className: ["callout-title"] } },
      children: [{ type: "text", value: defaultTitle }],
    } as never);
  }
}

/** :::center / :::right — 블록 정렬 */
function alignBlock(node: DirectiveNode): void {
  node.data = {
    hName: "div",
    hProperties: { className: [`align-${node.name}`] },
  };
}

/** :::indent{n=2} — n단계(1~8) 들여쓰기 */
function indentBlock(node: DirectiveNode): void {
  const raw = Number(node.attributes?.n ?? node.attributes?.level ?? 1);
  const n = Number.isInteger(raw) ? Math.min(Math.max(raw, 1), 8) : 1;
  node.data = {
    hName: "div",
    hProperties: { className: ["indent-block"], style: `margin-left: ${n * 1.5}rem` },
  };
}

/**
 * :::fold{h=2} / :::fold{h=none} — 섹션 소속 오버라이드.
 * 실제 재배치는 rehype 단계의 wrapSections가 dataFold 값을 보고 수행한다.
 * h는 2~6 또는 none만 유효. 그 외 값은 none으로 취급.
 */
function foldBlock(node: DirectiveNode): void {
  const raw = String(node.attributes?.h ?? "none");
  const value = /^[2-6]$/.test(raw) ? raw : "none";
  node.data = {
    hName: "div",
    hProperties: { className: ["fold-override"], dataFold: value },
  };
}

/**
 * :postlink[표시 텍스트]{slug=other-post} — 다른 포스트로의 인라인 링크.
 * 문단 안에 자연스럽게 들어가야 해서 카드 임베드(::post)와 달리 텍스트
 * 디렉티브(콜론 1개)를 쓴다. href는 slug로 바로 만들어지고(라우트가
 * /[slug]), post-embeds.ts의 DB round-trip 없이 render.ts 안에서 즉시
 * 해석된다 — 존재 여부는 검증하지 않는다(일반 마크다운 링크와 동일하게,
 * 잘못된 slug면 그냥 404로 이어질 뿐).
 */
function postLink(node: DirectiveNode): void {
  const label = node.children
    .map((c) => (c.type === "text" ? (c.value ?? "") : ""))
    .join("")
    .trim();
  const rawSlug = (node.attributes?.slug ?? "").trim().toLowerCase();

  if (!EMBED_POST_SLUG_PATTERN.test(rawSlug)) {
    node.data = {
      hName: "span",
      hProperties: { className: ["md-postlink-error"] },
      hChildren: [{ type: "text", value: "[postlink: 잘못된 slug]" }],
    };
    return;
  }

  node.data = {
    hName: "a",
    hProperties: { href: `/${rawSlug}`, className: ["post-link"] },
    hChildren: [{ type: "text", value: label || rawSlug }],
  };
}

/**
 * :::indent/:::center/:::right 안의 헤딩을 문서 최상위로 끌어올려 rehypeSectionWrap이
 * 일반 헤딩과 동일하게 접기/섹션 대상으로 처리하게 한다 (lib/domain/markdown.ts와 동일 규칙 —
 * heading_tree의 id와 본문 앵커 id가 계속 1:1로 일치하려면 두 곳에서 같은 전처리가 필요하다).
 */
function remarkFlattenTransparentContainers() {
  return (tree: MdastRoot) => {
    tree.children = flattenTransparentContainers(tree.children);
  };
}

function remarkCustomDirectives(options: { blueskyDids: ReadonlyMap<string, string> }) {
  const { blueskyDids } = options;
  return (tree: MdastRoot) => {
    visit(tree, (node) => {
      const directive = node as unknown as DirectiveNode;
      if (directive.type === "leafDirective") {
        if (directive.name === "youtube") {
          youtubeEmbed(directive);
        } else if (directive.name === "x") {
          xEmbed(directive);
        } else if (directive.name === "soundcloud") {
          soundcloudEmbed(directive);
        } else if (directive.name === "instagram") {
          instagramEmbed(directive);
        } else if (directive.name === "pinterest") {
          pinterestEmbed(directive);
        } else if (directive.name === "bluesky") {
          blueskyEmbed(directive, blueskyDids);
        } else if (directive.name === "video") {
          videoEmbed(directive);
        } else if (directive.name === "post") {
          postEmbed(directive);
        } else if (directive.name === "series") {
          seriesEmbed(directive);
        }
      } else if (directive.type === "textDirective" && directive.name === "postlink") {
        postLink(directive);
      } else if (directive.type === "containerDirective") {
        if (directive.name in CALLOUT_TYPES) calloutBlock(directive);
        else if (directive.name === "center" || directive.name === "right") alignBlock(directive);
        else if (directive.name === "indent") indentBlock(directive);
        else if (directive.name === "fold") foldBlock(directive);
      }
    });
  };
}

// ---------- URL 스킴 새니타이즈 ----------

const SAFE_URL_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/**
 * 링크/이미지의 javascript: 등 위험 스킴 제거 (심층 방어).
 * 단일 저자라 실질 위험은 self-XSS지만, 마크다운 링크 목적지는
 * remark가 검증하지 않으므로 렌더 단계에서 차단한다.
 * 스킴 없는 상대/앵커 URL은 그대로 허용.
 */
function rehypeSanitizeUrls() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      for (const attr of ["href", "src"] as const) {
        const value = node.properties?.[attr];
        if (typeof value !== "string") continue;
        const match = /^\s*([a-z][a-z0-9+.-]*):/i.exec(value);
        if (match && !SAFE_URL_SCHEMES.has(match[1].toLowerCase())) {
          delete node.properties[attr];
        }
      }
    });
  };
}

function formatDimension(val: string): string {
  if (/^\d+(\.\d+)?$/.test(val)) {
    return `${val}px`;
  }
  return val;
}

/**
 * 이미지 크기 조절: src URL의 query parameter나 hash fragment에서
 * w/width, h/height 속성을 읽어 style 속성으로 변환해 적용한다.
 * 비율 고정을 위해 한쪽만 있을 때 다른 한쪽은 auto로 명시한다.
 */
function rehypeImageResize() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img") return;
      const src = node.properties?.src;
      if (typeof src !== "string") return;

      try {
        const url = new URL(src, "http://localhost");
        let width = url.searchParams.get("w") || url.searchParams.get("width");
        let height = url.searchParams.get("h") || url.searchParams.get("height");

        if (!width || !height) {
          const hashParams = new URLSearchParams(url.hash.slice(1));
          if (!width) width = hashParams.get("w") || hashParams.get("width");
          if (!height) height = hashParams.get("h") || hashParams.get("height");
        }

        if (width || height) {
          const styles: string[] = [];
          if (node.properties.style && typeof node.properties.style === "string") {
            styles.push(node.properties.style);
          }
          if (width) {
            styles.push(`width: ${formatDimension(width)}`);
            if (!height) styles.push("height: auto");
          }
          if (height) {
            styles.push(`height: ${formatDimension(height)}`);
            if (!width) styles.push("width: auto");
          }
          node.properties.style = styles.join("; ");
        }
      } catch {
        // Ignore invalid URLs
      }
    });
  };
}


// ---------- 코드 하이라이팅 (shiki, 서버 렌더 시 1회) ----------

const HIGHLIGHT_LANGS = [
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "json",
  "bash",
  "shell",
  "powershell",
  "python",
  "sql",
  "yaml",
  "toml",
  "html",
  "css",
  "markdown",
  "diff",
  "docker",
  "go",
  "rust",
  "java",
  "kotlin",
  "c",
  "cpp",
  "csharp",
];

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: ["github-light", "github-dark"],
    langs: HIGHLIGHT_LANGS,
  });
  return highlighterPromise;
}

function codeLanguage(code: Element): string | null {
  const className = code.properties?.className;
  if (!Array.isArray(className)) return null;
  const langClass = className.find((c) => typeof c === "string" && c.startsWith("language-"));
  return typeof langClass === "string" ? langClass.slice("language-".length) : null;
}

/**
 * pre > code[class=language-*]를 shiki가 하이라이팅한 <pre>로 교체.
 * - mermaid 블록은 제외 (lazy render 컨테이너가 원문 텍스트를 읽어야 함, 스펙 4.2)
 * - 미지원 언어/언어 미지정 블록은 그대로 둔다
 */
function rehypeShikiHighlight() {
  return async (tree: Root) => {
    const targets: Array<{ node: Element; index: number; parent: Element | Root }> = [];

    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "pre" || index === undefined || !parent) return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;
      const lang = codeLanguage(code);
      if (!lang || lang === "mermaid") return;
      targets.push({ node, index, parent: parent as Element | Root });
    });

    if (targets.length === 0) return;
    const highlighter = await getHighlighter();
    const loaded = new Set(highlighter.getLoadedLanguages());

    for (const { node, index, parent } of targets) {
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      )!;
      const lang = codeLanguage(code)!;
      if (!loaded.has(lang)) continue;

      const text = textOf(code).replace(/\n$/, "");
      // 듀얼 테마: 기본은 light 색, 다크모드는 CSS의 --shiki-dark 변수로 전환
      const hast = highlighter.codeToHast(text, {
        lang,
        themes: { light: "github-light", dark: "github-dark" },
      });
      const pre = hast.children[0];
      if (pre?.type === "element") {
        parent.children[index] = pre;
      }
    }
  };
}

function rehypeSourceLines() {
  return (tree: Root) => {
    for (const child of tree.children) {
      if (child.type === "element" && child.position) {
        child.properties = {
          ...child.properties,
          "data-sl": String(child.position.start.line),
          "data-el": String(child.position.end.line),
        };
      }
    }
  };
}

/** 게시 뷰용 HTML 생성. heading_tree는 저장된 JSON을 그대로 쓰고(스펙 4.1), 본문만 여기서 변환한다. */
export async function renderPostHtml(contentMd: string, withSourceAttrs = false): Promise<string> {
  // bluesky embed는 DID 기반 URL이 필요 — remark 방문자(동기) 실행 전에 미리 해석
  const blueskyDids = await resolveBlueskyDids(contentMd);

  const pipeline = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath) // $인라인$, $$블록$$ 수식
    .use(remarkDirective)
    .use(remarkFlattenTransparentContainers)
    .use(remarkCustomDirectives, { blueskyDids })
    .use(remarkRehype);

  if (withSourceAttrs) {
    pipeline.use(rehypeSourceLines);
  }

  const file = await pipeline
    .use(rehypeKatex) // 수식을 KaTeX HTML로 변환 (수식 오류 시 빨간 원문 표시)
    .use(rehypeSanitizeUrls)
    .use(rehypeImageResize)
    .use(rehypeSectionWrap)
    .use(rehypeShikiHighlight)
    .use(rehypeStringify)
    .process(contentMd);
  return String(file);
}
