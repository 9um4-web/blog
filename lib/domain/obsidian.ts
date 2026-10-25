import { calloutMeta } from "@gogum4/editor-schema/callout";
import { detectEmbed, normalizeEmbedSize } from "@gogum4/editor-schema/embed";
import { indentFromLeadingSpaces } from "@gogum4/editor-schema/indent";
import type { Blockquote, Heading, Link, Paragraph, PhrasingContent, Root, RootContent } from "mdast";
import { visit } from "unist-util-visit";
import { blueskyEmbed, isBlueskyUrl } from "./bluesky";
import { externalEmbed, isVideoFileUrl, videoFileEmbed } from "./embeds";
import { applyHtmlWrappers, type WrapperNode } from "./html-wrappers";

/**
 * Obsidian 호환 문법을 읽는 remark 플러그인 (블로그 방언 `:::`/`::` 디렉티브를 대신한다).
 *
 * - `> [!종류] 제목` 콜아웃 (종류는 자유 이름 — 렌더 결과 `div.callout.callout-종류`)
 * - `![](주소)` / `![|500x300](주소)` : YouTube·X·Instagram·Pinterest·SoundCloud 임베드(+블로그 전용 Bluesky), `.mp4` 등은 비디오
 * - `![[슬러그]]` 글 임베드, `![[series/슬러그]]` 시리즈 임베드 (카드 자리표시 — 실제 카드는 post-embeds.ts가 DB에서 채운다)
 * - `[[슬러그]]` / `[[슬러그|표시]]` 글 링크
 * - 문단·제목 맨 앞의 `&emsp;` (두 개가 한 단계) 들여쓰기
 * - `<div align>` / `<div data-fold>` 래퍼 (html-wrappers.ts)
 */

const SLUG_PATTERN = /^[a-z0-9-]{1,100}$/;
const WIKI_EMBED = /^!\[\[([^\]\n|#]+)\]\]$/;
const WIKI_LINK = /\[\[([^\]\n|#]+)(?:\|([^\]\n]*))?\]\]/g;
const CALLOUT_HEAD = /^\[!([A-Za-z][A-Za-z0-9_-]{0,31})\][+-]?[ \t]*/;
const EMBED_SIZE_ALT = /^\s*\|\s*(\d+)(?:x(\d+))?\s*$/;

/** 예전 `:::note` 방언의 기본 제목(모양을 바꾸지 않으려 그대로 둔다). 그 밖의 종류는 @gogum4/editor-schema의 이름을 쓴다. */
const LEGACY_TITLES: Record<string, string> = { note: "노트", info: "정보", tip: "팁", warning: "주의", danger: "위험" };

/** mdast 노드를 hast로 바꿀 때 쓰는 hName/hProperties를 달아 둔 커스텀 노드. */
interface HNode {
  type: string;
  children: unknown[];
  data: { hName: string; hProperties?: Record<string, unknown>; hChildren?: unknown[] };
  position?: RootContent["position"];
}

function textOfPhrasing(nodes: PhrasingContent[]): string {
  return nodes
    .map((node) => {
      if ("value" in node) return node.value;
      if ("children" in node) return textOfPhrasing(node.children as PhrasingContent[]);
      return "";
    })
    .join("");
}

// ---------- 콜아웃 ----------

function toCallout(quote: Blockquote): HNode | null {
  const first = quote.children[0];
  if (first?.type !== "paragraph") return null;
  const head = first.children[0];
  if (head?.type !== "text") return null;
  const match = CALLOUT_HEAD.exec(head.value);
  if (!match) return null;

  const type = match[1].toLowerCase();
  // 표식 줄(첫 줄)의 나머지가 제목, 줄바꿈 뒤가 본문 첫 문단이다.
  const rest: PhrasingContent[] = [{ ...head, value: head.value.slice(match[0].length) }, ...first.children.slice(1)];
  const title: PhrasingContent[] = [];
  const body: PhrasingContent[] = [];
  let inBody = false;
  for (const node of rest) {
    if (inBody) {
      body.push(node);
    } else if (node.type === "break") {
      inBody = true;
    } else if (node.type === "text" && node.value.includes("\n")) {
      const at = node.value.indexOf("\n");
      title.push({ ...node, value: node.value.slice(0, at) });
      body.push({ ...node, value: node.value.slice(at + 1) });
      inBody = true;
    } else {
      title.push(node);
    }
  }

  const blocks: RootContent[] = [];
  const bodyText = textOfPhrasing(body).trim();
  if (body.length > 0 && (bodyText !== "" || body.some((node) => node.type !== "text"))) {
    blocks.push({ type: "paragraph", children: body.filter((node) => node.type !== "text" || node.value !== "") } as Paragraph);
  }
  blocks.push(...quote.children.slice(1));

  let titleNodes = title.filter((node) => node.type !== "text" || node.value !== "");
  if (textOfPhrasing(titleNodes).trim() === "") {
    titleNodes = [];
    // 제목 줄이 없을 때 첫 문단이 굵은 글 하나뿐이면 그것이 제목이다(에디터는 제목을 이렇게 내보낸다: `> [!NOTE]` 다음 줄 `> **제목**`).
    const lead = blocks[0];
    if (lead?.type === "paragraph" && lead.children.length === 1 && lead.children[0].type === "strong") {
      titleNodes = lead.children[0].children;
      blocks.shift();
    }
  }
  if (titleNodes.length === 0) {
    const label = LEGACY_TITLES[type] ?? calloutMeta(type).label;
    titleNodes = [{ type: "text", value: label }];
  }

  return {
    type: "callout",
    data: { hName: "div", hProperties: { className: ["callout", `callout-${type}`] } },
    children: [
      { type: "calloutTitle", data: { hName: "div", hProperties: { className: ["callout-title"] } }, children: titleNodes } as HNode,
      ...blocks,
    ],
    position: quote.position,
  };
}

function transformCallouts(parent: { children: unknown[] }): void {
  parent.children = parent.children.map((child) => {
    const node = child as RootContent;
    if (node.type === "blockquote") {
      const callout = toCallout(node);
      if (callout) {
        transformCallouts(callout);
        return callout;
      }
    }
    if ("children" in node) transformCallouts(node as { children: unknown[] });
    return node;
  });
}

// ---------- 임베드·링크·들여쓰기 ----------

function placeholder(kind: "post" | "series", value: string): HNode["data"] {
  return kind === "post"
    ? { hName: "div", hProperties: { className: ["md-embed", "md-embed-post"], "data-embed": "post", "data-post-slug": value } }
    : { hName: "div", hProperties: { className: ["md-embed", "md-embed-series"], "data-embed": "series", "data-series-slug": value } };
}

function errorLine(text: string): HNode["data"] {
  return { hName: "p", hChildren: [{ type: "text", value: text }] };
}

function imageSize(alt: string | null | undefined): { width?: number; height?: number } {
  const match = EMBED_SIZE_ALT.exec(alt ?? "");
  if (!match) return {};
  const width = normalizeEmbedSize(match[1]) ?? undefined;
  const height = match[2] !== undefined ? (normalizeEmbedSize(match[2]) ?? undefined) : undefined;
  return { width, height };
}

/** 문단 하나가 임베드 한 줄이면 (자리표시 | 외부 임베드 | 비디오) 노드 데이터를, 아니면 null. */
function embedParagraph(paragraph: Paragraph, blueskyDids: ReadonlyMap<string, string>): HNode["data"] | null {
  const kids = paragraph.children.filter((node) => !(node.type === "text" && node.value.trim() === ""));
  if (kids.length !== 1) return null;
  const only = kids[0];

  if (only.type === "text") {
    const match = WIKI_EMBED.exec(only.value.trim());
    if (!match) return null;
    const target = match[1].trim();
    const series = /^series\/(.+)$/.exec(target);
    const slug = (series ? series[1] : target).trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug)) return errorLine(series ? "[series: 잘못된 slug]" : "[post: 잘못된 slug]");
    return placeholder(series ? "series" : "post", slug);
  }

  if (only.type === "image") {
    const url = only.url.trim();
    const { width, height } = imageSize(only.alt);
    const target = detectEmbed(url);
    if (target !== null) return externalEmbed(target, width, height) ?? errorLine("[embed: 지원하지 않는 주소]");
    if (isVideoFileUrl(url)) return videoFileEmbed(url, width, height);
    if (isBlueskyUrl(url)) return blueskyEmbed(url, blueskyDids, width, height);
  }
  return null;
}

function linkPosts(children: PhrasingContent[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  for (const node of children) {
    if (node.type !== "text" || !node.value.includes("[[")) {
      out.push(node);
      continue;
    }
    let last = 0;
    for (const match of node.value.matchAll(WIKI_LINK)) {
      const slug = match[1].trim().toLowerCase();
      if (!SLUG_PATTERN.test(slug) || node.value[(match.index ?? 0) - 1] === "!") continue;
      const index = match.index ?? 0;
      if (index > last) out.push({ type: "text", value: node.value.slice(last, index) });
      const label = (match[2] ?? "").trim() || slug;
      out.push({
        type: "link",
        url: `/${slug}`,
        children: [{ type: "text", value: label }],
        data: { hProperties: { className: ["post-link"] } },
      } as Link);
      last = index + match[0].length;
    }
    if (last === 0) out.push(node);
    else if (last < node.value.length) out.push({ type: "text", value: node.value.slice(last) });
  }
  return out;
}

/** 문단·제목 맨 앞의 U+2003(`&emsp;`)을 떼어 단계로 바꾼다. */
function takeIndent(block: Paragraph | Heading): number {
  const lead = block.children[0];
  if (lead?.type !== "text") return 0;
  const count = lead.value.length - lead.value.replace(/^ +/, "").length;
  const level = indentFromLeadingSpaces(count);
  if (level === null) return 0;
  lead.value = lead.value.slice(count);
  if (lead.value === "") block.children.shift();
  return level;
}

function setStyle(node: object, css: string): void {
  const holder = node as { data?: Record<string, unknown> };
  const data = (holder.data ??= {}) as { hProperties?: Record<string, unknown> };
  data.hProperties = { ...data.hProperties, style: css };
}

// ---------- 플러그인 ----------

function remarkObsidianSyntax(options: { blueskyDids?: ReadonlyMap<string, string> } = {}) {
  const blueskyDids = options.blueskyDids ?? new Map<string, string>();
  return (tree: Root) => {
    tree.children = applyHtmlWrappers(tree.children);
    transformCallouts(tree);

    visit(tree, (node) => {
      const { type } = node as { type: string };
      if (type === "htmlWrapper") {
        const wrapper = (node as unknown as WrapperNode).wrapper;
        const target = node as unknown as HNode;
        target.data =
          wrapper.type === "align"
            ? { hName: "div", hProperties: { className: [`align-${wrapper.value}`] } }
            : { hName: "div", hProperties: { className: ["fold-override"], dataFold: wrapper.value } };
        return;
      }
      if (type === "paragraph") {
        const paragraph = node as Paragraph;
        const embed = embedParagraph(paragraph, blueskyDids);
        if (embed !== null) {
          (paragraph as unknown as HNode).data = embed;
          paragraph.children = [];
          return;
        }
        const level = takeIndent(paragraph);
        if (level > 0) setStyle(paragraph, `margin-left: ${level * 1.5}rem`);
        paragraph.children = linkPosts(paragraph.children);
        return;
      }
      if (type === "heading") {
        const heading = node as Heading;
        const level = takeIndent(heading);
        if (level > 0) setStyle(heading, `margin-left: ${level * 1.5}rem`);
        heading.children = linkPosts(heading.children);
      }
    });
  };
}

export { remarkObsidianSyntax };
