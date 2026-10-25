import { detectEmbed, normalizeEmbedSize } from "@gogum4/editor-schema/embed";
import { EMSP_PER_LEVEL, MAX_INDENT } from "@gogum4/editor-schema/indent";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { Root } from "mdast";
import { isVideoFileUrl } from "./embeds";

/**
 * 예전 블로그 방언(remark-directive: `::youtube`, `:::note` …)으로 쓴 글을 Obsidian 호환 문법으로 옮긴다 (한 번만 쓰는 변환기).
 *
 *   ::youtube[ID] · ::x/::soundcloud/::instagram/::pinterest[URL]   →  ![|500x300](URL)
 *   ::bluesky[URL] · ::video[URL]                                    →  ![|500](URL)
 *   ::post{slug=a}                                                    →  ![[a]]
 *   ::series{id=3}                                                    →  ![[series/슬러그]]   (id → 슬러그는 DB에서 받은 표로)
 *   :postlink[텍스트]{slug=a}                                         →  [[a|텍스트]]
 *   :::note|info|tip|warning|danger[제목]                             →  > [!NOTE] 제목
 *   :::center / :::right                                              →  <div align="center">
 *   :::indent{n=2}                                                    →  문단·제목 앞에 &emsp;를 단계×2개
 *   :::fold{h=2}                                                      →  <div data-fold="2">
 *
 * 코드 펜스(```/~~~)와 `$$` 수식 안은 건드리지 않는다. 바꾸지 못한 줄은 그대로 두고 notices에 이유를 남긴다 — 사람이 확인해야 한다.
 */

export interface LegacyMigrationOptions {
  /** `::series{id=3}`의 id → 시리즈 슬러그. 없는 id는 바꾸지 못한 줄로 남긴다. */
  seriesSlugById: ReadonlyMap<number, string>;
}

export interface LegacyMigrationResult {
  markdown: string;
  /** 사람이 확인할 안내(줄 번호는 원문 기준). */
  notices: string[];
  changed: boolean;
}

const SLUG = /^[a-z0-9-]{1,100}$/;
const CONTAINER_OPEN = /^(:{3,})([A-Za-z][\w-]*)(?:\[([^\]]*)\])?(?:\{([^}]*)\})?\s*$/;
const CONTAINER_CLOSE = /^:{3,}\s*$/;
const LEAF = /^::([A-Za-z][\w-]*)(?:\[([^\]]*)\])?(?:\{([^}]*)\})?\s*$/;
const POSTLINK = /:postlink(?:\[((?:\\.|[^\]\\])*)\])?\{([^}]*)\}/g;
const CODE_FENCE = /^\s*(`{3,}|~{3,})/;

const CALLOUT_NAMES: Record<string, string> = { note: "NOTE", tip: "TIP", warning: "WARNING", info: "info", danger: "danger" };
const EMBED_LEAVES = new Set(["youtube", "x", "soundcloud", "instagram", "pinterest", "bluesky"]);

type Attrs = Record<string, string>;

function parseAttrs(source: string | undefined): Attrs {
  const attrs: Attrs = {};
  if (!source) return attrs;
  for (const match of source.matchAll(/([A-Za-z_][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s,}]+))/g)) {
    attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

type Item = { kind: "line"; text: string; line: number; raw: boolean } | Container;

interface Container {
  kind: "container";
  name: string;
  title: string | undefined;
  attrs: Attrs;
  line: number;
  head: string;
  children: Item[];
  closed: boolean;
}

function parseItems(lines: string[]): { items: Item[]; unclosed: Container[] } {
  const root: Item[] = [];
  const stack: Container[] = [];
  const unclosed: Container[] = [];
  const target = () => (stack.length > 0 ? stack[stack.length - 1].children : root);
  let fence: { char: string; length: number } | null = null;
  let inMath = false;

  lines.forEach((text, index) => {
    const line = index + 1;
    const push = (raw: boolean) => target().push({ kind: "line", text, line, raw });

    if (fence !== null) {
      const close = CODE_FENCE.exec(text);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length && text.trim() === close[1]) fence = null;
      push(true);
      return;
    }
    if (inMath) {
      if (text.includes("$$")) inMath = false;
      push(true);
      return;
    }
    const open = CODE_FENCE.exec(text);
    if (open) {
      fence = { char: open[1][0], length: open[1].length };
      push(true);
      return;
    }
    if (/^\s*\$\$/.test(text)) {
      // 한 줄에 여닫는 $$가 모두 있으면 블록이 이어지지 않는다.
      if (((text.match(/\$\$/g) ?? []).length & 1) === 1) inMath = true;
      push(true);
      return;
    }

    const container = CONTAINER_OPEN.exec(text);
    if (container) {
      const node: Container = { kind: "container", name: container[2], title: container[3], attrs: parseAttrs(container[4]), line, head: text, children: [], closed: false };
      target().push(node);
      stack.push(node);
      return;
    }
    if (CONTAINER_CLOSE.test(text) && stack.length > 0) {
      stack.pop()!.closed = true;
      return;
    }
    push(false);
  });

  while (stack.length > 0) unclosed.push(stack.pop()!);
  return { items: root, unclosed };
}

// ---------- 한 줄 변환 ----------

class Output {
  readonly lines: string[] = [];
  private pendingBlank = false;

  line(text: string): void {
    if (this.pendingBlank && text.trim() !== "" && this.lines.length > 0 && this.lines[this.lines.length - 1].trim() !== "") this.lines.push("");
    this.pendingBlank = false;
    this.lines.push(text);
  }

  /** 앞뒤가 빈 줄이어야 하는 블록(임베드 한 줄, 정렬 래퍼 …). */
  block(lines: string[]): void {
    if (this.lines.length > 0 && this.lines[this.lines.length - 1].trim() !== "") this.lines.push("");
    this.lines.push(...lines);
    this.pendingBlank = true;
  }
}

function sizeAlt(attrs: Attrs, notices: string[], line: number): string {
  const width = attrs.w ?? attrs.width;
  const height = attrs.h ?? attrs.height;
  const parse = (value: string | undefined): number | null => {
    if (value === undefined) return null;
    const match = /^(\d+)(?:px)?$/.exec(value.trim());
    return match ? normalizeEmbedSize(match[1]) : null;
  };
  const w = parse(width);
  const h = parse(height);
  if (width !== undefined && w === null) notices.push(`줄 ${line}: 가로 크기 "${width}"는 100~2000px 정수만 쓸 수 있어 뺐습니다.`);
  if (height !== undefined && h === null) notices.push(`줄 ${line}: 세로 크기 "${height}"는 100~2000px 정수만 쓸 수 있어 뺐습니다.`);
  if (w === null) {
    if (h !== null) notices.push(`줄 ${line}: 세로 크기만으로는 쓸 수 없어(가로가 있어야 함) 뺐습니다.`);
    return "";
  }
  return h !== null ? `|${w}x${h}` : `|${w}`;
}

/** 한 줄 리프 디렉티브(`::name…`)를 바꾼 줄들. 바꾸지 못하면 null(+안내). */
function convertLeaf(text: string, line: number, options: LegacyMigrationOptions, notices: string[]): string[] | null {
  const match = LEAF.exec(text);
  if (!match) return null;
  const name = match[1];
  const label = (match[2] ?? "").trim();
  const attrs = parseAttrs(match[3]);
  const fail = (reason: string): null => {
    notices.push(`줄 ${line}: ${reason} — 원문을 그대로 두었습니다: ${text.trim()}`);
    return null;
  };

  if (name === "post") {
    const slug = (attrs.slug ?? "").trim().toLowerCase();
    return SLUG.test(slug) ? [`![[${slug}]]`] : fail("글 슬러그가 올바르지 않습니다");
  }
  if (name === "series") {
    const id = Number((attrs.id ?? "").trim());
    const slug = Number.isInteger(id) ? options.seriesSlugById.get(id) : undefined;
    return slug !== undefined && SLUG.test(slug) ? [`![[series/${slug}]]`] : fail("시리즈 id에 해당하는 시리즈를 찾지 못했습니다");
  }
  if (name === "youtube") {
    const url = `https://www.youtube.com/watch?v=${attrs.id ?? label}`;
    const target = detectEmbed(url);
    return target?.provider === "youtube" ? [`![${sizeAlt(attrs, notices, line)}](${target.url})`] : fail("유튜브 영상 ID가 올바르지 않습니다(11자)");
  }
  if (EMBED_LEAVES.has(name)) {
    const target = detectEmbed((attrs.url ?? label).trim());
    return target?.provider === name ? [`![${sizeAlt(attrs, notices, line)}](${target.url})`] : fail(`${name} 주소를 알아보지 못했습니다`);
  }
  if (name === "video") {
    const url = (attrs.url ?? label).trim();
    return isVideoFileUrl(url) ? [`![${sizeAlt(attrs, notices, line)}](${url})`] : fail("비디오 파일(.mp4 등) 주소가 아닙니다");
  }
  return null;
}

/** 인라인 코드 밖의 `:postlink[텍스트]{slug=…}`를 `[[슬러그|텍스트]]`로. */
function convertInline(text: string, line: number, notices: string[]): string {
  if (!text.includes(":postlink")) return text;
  return text
    .split(/(`+[^`]*`+)/)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(POSTLINK, (whole, label: string | undefined, rawAttrs: string) => {
            const slug = (parseAttrs(rawAttrs).slug ?? "").trim().toLowerCase();
            if (!SLUG.test(slug)) {
              notices.push(`줄 ${line}: :postlink의 슬러그가 올바르지 않아 그대로 두었습니다: ${whole}`);
              return whole;
            }
            const text = (label ?? "").trim();
            return text === "" || text === slug ? `[[${slug}]]` : `[[${slug}|${text}]]`;
          }),
    )
    .join("");
}

// ---------- 들여쓰기 ----------

function isEmbedOnlyParagraph(node: Root["children"][number], source: string): boolean {
  if (node.type !== "paragraph") return false;
  const text = source.slice(node.position!.start.offset, node.position!.end.offset).trim();
  return /^!\[[^\]]*\]\([^)]*\)$/.test(text) || /^!\[\[[^\]]*\]\]$/.test(text);
}

function applyIndent(lines: string[], levels: number, notices: string[], line: number): string[] {
  const source = lines.join("\n");
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(source) as Root;
  const prefix = "&emsp;".repeat(Math.min(levels, MAX_INDENT) * EMSP_PER_LEVEL);
  const out = [...lines];
  let skipped = false;
  for (const node of tree.children) {
    const first = node.position!.start.line - 1;
    if (node.type === "heading") {
      out[first] = out[first].replace(/^(\s{0,3}#{1,6}[ \t]+)/, `$1${prefix}`);
    } else if (node.type === "paragraph" && !isEmbedOnlyParagraph(node, source)) {
      out[first] = prefix + out[first].replace(/^\s+/, "");
    } else if (node.type !== "paragraph") {
      skipped = true;
    }
  }
  if (skipped) notices.push(`줄 ${line}: :::indent 안의 목록·코드·표·인용 등은 들여쓰기를 옮길 수 없어 그대로 두었습니다(문단과 제목만 들여쓰기).`);
  return out;
}

// ---------- 변환 ----------

function emitItems(items: Item[], out: Output, options: LegacyMigrationOptions, notices: string[]): void {
  for (const item of items) {
    if (item.kind === "line") {
      if (item.raw) {
        out.line(item.text);
        continue;
      }
      const leaf = convertLeaf(item.text, item.line, options, notices);
      if (leaf !== null) out.block(leaf);
      else out.line(convertInline(item.text, item.line, notices));
      continue;
    }
    emitContainer(item, out, options, notices);
  }
}

function render(items: Item[], options: LegacyMigrationOptions, notices: string[]): string[] {
  const inner = new Output();
  emitItems(items, inner, options, notices);
  return inner.lines;
}

function emitContainer(node: Container, out: Output, options: LegacyMigrationOptions, notices: string[]): void {
  const body = render(node.children, options, notices);
  // 앞뒤 빈 줄은 래퍼가 정한다.
  while (body.length > 0 && body[0].trim() === "") body.shift();
  while (body.length > 0 && body[body.length - 1].trim() === "") body.pop();

  if (node.name in CALLOUT_NAMES) {
    const title = node.title?.trim();
    const head = `> [!${CALLOUT_NAMES[node.name]}]${title ? ` ${title}` : ""}`;
    // 이미지·임베드 줄은 표식 줄과 같은 문단이 되지 않게 빈 인용 줄로 띄운다.
    const gap = body[0]?.startsWith("![") ? [">"] : [];
    out.block([head, ...gap, ...body.map((text) => (text === "" ? ">" : `> ${text}`))]);
    return;
  }
  if (node.name === "center" || node.name === "right") {
    out.block([`<div align="${node.name}">`, "", ...body, "", "</div>"]);
    return;
  }
  if (node.name === "fold") {
    const h = /^[2-6]$/.test(node.attrs.h ?? "") ? node.attrs.h : "none";
    out.block([`<div data-fold="${h}">`, "", ...body, "", "</div>"]);
    return;
  }
  if (node.name === "indent") {
    const raw = Number(node.attrs.n ?? node.attrs.level ?? 1);
    const levels = Number.isInteger(raw) ? Math.min(Math.max(raw, 1), MAX_INDENT) : 1;
    out.block(applyIndent(body, levels, notices, node.line));
    return;
  }
  notices.push(`줄 ${node.line}: 알 수 없는 컨테이너 ":::${node.name}"의 래퍼를 빼고 안쪽 내용만 남겼습니다.`);
  out.block(body);
}

export function migrateLegacyDialect(source: string, options: LegacyMigrationOptions): LegacyMigrationResult {
  const crlf = source.includes("\r\n");
  const normalized = source.replace(/\r\n/g, "\n");
  const endsWithNewline = normalized.endsWith("\n");
  const lines = (endsWithNewline ? normalized.slice(0, -1) : normalized).split("\n");

  const notices: string[] = [];
  const { items, unclosed } = parseItems(lines);
  for (const node of unclosed.reverse()) notices.push(`줄 ${node.line}: 닫히지 않은 컨테이너 "${node.head.trim()}"가 문서 끝까지 이어집니다(예전 렌더도 같았습니다).`);

  const out = new Output();
  emitItems(items, out, options, notices);
  let markdown = out.lines.join("\n");
  if (endsWithNewline) markdown += "\n";
  if (crlf) markdown = markdown.replace(/\n/g, "\r\n");
  return { markdown, notices, changed: markdown !== source };
}
