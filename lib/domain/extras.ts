import {
  CITATION_IN_TEXT_SOURCE,
  citationKeys,
  colorsFromStyle,
  type ExtraSyntax,
  isSkippedTag,
  normalizeAbbrTitle,
  normalizeCitationSource,
  normalizeTag,
  replaceEmojiShortcodes,
  TAG_IN_TEXT_SOURCE,
} from "@gogum4/editor-schema/extras";
import type { Root, RootContent } from "mdast";

/**
 * 추가 문법(@gogum4/editor-* 0.4의 `extras`)을 읽는 remark 플러그인. 블로그 렌더러는 에디터 패키지의 렌더러가 아니라 자체 unified 파이프라인이라서
 * 편집기가 내보내는 표기를 여기서도 읽는다(표기 명세는 js-editor의 docs/MARKDOWN-DIALECT.md "추가 문법").
 *
 * - 마크: `==하이라이트==`, `^위첨자^`, `++삽입++`, `<mark>`·`<sup>`·`<sub>`·`<ins>`, `<span style="color/background-color: #rrggbb">`, `<abbr title>`
 * - 주석 `%%글%%`(독자에게 보이지 않는다), 태그 `#태그`, 인용 `[@키]`, 인라인 각주 `^[글]`, 이모지 `:smile:`
 * - 정의 목록(`용어` 다음 줄 `: 설명`), 목차 `[toc]`
 *
 * 한계: 글자 속에 이스케이프로 쓴 `\=\=` 같은 것은 remark가 이미 `==`로 풀어 놓아서 구별하지 못한다(한 문단에 쌍이 있으면 하이라이트로 읽힌다).
 * 서식을 가로지르는 `==`(`==a **b** c==`)는 읽지 않는다 — 편집기는 서식 조각마다 따로 `==`를 닫아 내보내므로 편집기가 쓴 글은 읽힌다.
 */

/**
 * 블로그가 켜는 추가 문법. 렌더러(이 파일)와 시각 편집기(`lib/wysiwyg-markdown.ts`·`wysiwyg-editor.tsx`)가 **같은 값**을 쓴다.
 * 개발 블로그라 `#fff`·`#ff00aa` 같은 16진 색 글자가 많아서 태그로 읽지 않는다(`skipHexColors`).
 */
export const BLOG_EXTRAS: ExtraSyntax = {
  marks: true,
  abbr: true,
  comments: true,
  tags: { skipHexColors: true },
  citations: true,
  definitions: true,
  toc: true,
  emoji: true,
};

type Node = { type: string; children?: Node[]; value?: string; data?: Record<string, unknown>; [key: string]: unknown };

const PHRASING_CONTAINERS = new Set(["paragraph", "heading", "emphasis", "strong", "delete", "link", "tableCell", "extraMark"]);
const HTML_MARK = /^<(mark|sup|sub|ins|abbr|span)(\s[^>]*)?>$/i;
const HTML_CLOSE = /^<\/(mark|sup|sub|ins|abbr|span)>$/i;
const TAG_ELEMENT: Record<string, string> = { mark: "mark", sup: "sup", sub: "sub", ins: "ins", abbr: "abbr", span: "span" };

const text = (value: string): Node => ({ type: "text", value });

function extraMark(tag: string, properties: Record<string, unknown>, children: Node[]): Node {
  return { type: "extraMark", children, data: { hName: TAG_ELEMENT[tag] ?? tag, hProperties: properties } };
}

/** 여는 HTML 태그가 허용한 서식이면 그 속성(hast)을, 아니면 null(span은 색이 있어야 하고 abbr는 title이 있어야 한다). */
function openProperties(tag: string, attrs: string): Record<string, unknown> | null {
  if (tag === "span") {
    const { color, background } = colorsFromStyle(/style\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "");
    if (color === null && background === null) return null;
    return { style: [color !== null ? `color: ${color}` : "", background !== null ? `background-color: ${background}` : ""].filter(Boolean).join("; ") };
  }
  if (tag === "abbr") {
    const title = normalizeAbbrTitle(/title\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    return title === null ? null : { title };
  }
  return {};
}

/** 형제 노드들에서 여는/닫는 인라인 HTML 태그 짝을 찾아 그 사이를 서식 노드로 감싼다. 짝이 없는 태그는 버려진다(HTML이라 렌더에서 사라진다). */
function wrapHtmlPairs(children: Node[]): Node[] {
  type Frame = { tag: string; properties: Record<string, unknown>; open: Node; items: Node[] };
  const stack: Frame[] = [];
  const base: Node[] = [];
  const target = () => (stack.length > 0 ? stack[stack.length - 1]!.items : base);
  for (const node of children) {
    if (node.type === "html" && typeof node.value === "string") {
      const open = HTML_MARK.exec(node.value.trim());
      if (open) {
        const tag = open[1]!.toLowerCase();
        const properties = openProperties(tag, open[2] ?? "");
        if (properties !== null) {
          stack.push({ tag, properties, open: node, items: [] });
          continue;
        }
      }
      const close = HTML_CLOSE.exec(node.value.trim());
      if (close) {
        const tag = close[1]!.toLowerCase();
        const at = stack.map((frame) => frame.tag).lastIndexOf(tag);
        if (at >= 0) {
          // 안쪽에 닫히지 않은 틀이 있으면 그 내용을 풀어서 바깥 틀에 둔다.
          while (stack.length - 1 > at) {
            const orphan = stack.pop()!;
            target().push(...orphan.items);
          }
          const frame = stack.pop()!;
          target().push(extraMark(tag, frame.properties, frame.items));
          continue;
        }
      }
    }
    target().push(node);
  }
  while (stack.length > 0) {
    const orphan = stack.pop()!;
    target().push(...orphan.items);
  }
  return base;
}

/** 글자 노드들 중 `regex`에 걸리는 조각을 `build`가 만든 노드로 바꾼다(코드·수식 등 글자 노드가 아닌 것은 그대로). `first`는 이 조각 묶음이 줄 처음 글자로 시작하는가. */
function rewrite(nodes: Node[], regex: RegExp, build: (match: RegExpExecArray, atStart: boolean) => Node[] | null, startsLine: boolean): Node[] {
  const out: Node[] = [];
  nodes.forEach((node, index) => {
    if (node.type !== "text" || typeof node.value !== "string") {
      out.push(node);
      return;
    }
    // 앞 노드가 글자가 아니면(굵은 글 바로 뒤 등) 이 글자의 처음은 줄이나 공백 뒤가 아니다.
    const previous = nodes[index - 1];
    const atStart = startsLine && index === 0 ? true : previous === undefined ? startsLine : previous.type === "text" && /\s$/.test(previous.value ?? "");
    const source = node.value;
    let last = 0;
    const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
    let changed = false;
    for (let match = re.exec(source); match; match = re.exec(source)) {
      const replacement = build(match, atStart && match.index === 0);
      if (replacement === null) continue;
      if (match.index > last) out.push(text(source.slice(last, match.index)));
      out.push(...replacement);
      last = match.index + match[0].length;
      changed = true;
    }
    if (!changed) out.push(node);
    else if (last < source.length) out.push(text(source.slice(last)));
  });
  return out;
}

interface Context {
  footnotes: Node[];
}

function inlineText(children: Node[], ctx: Context, startsLine: boolean): Node[] {
  let nodes = children;
  // 주석: 독자에게 보이지 않는다(여러 줄도 된다).
  nodes = rewrite(nodes, /%%([\s\S]*?)%%/g, (match) => (match[1]!.trim() === "" || match[1]!.includes("%%") ? null : []), startsLine);
  // 인라인 각주 \`^[글]\` → 각주 참조 + 문서 끝의 정의
  nodes = rewrite(
    nodes,
    /\^\[([^\]\n]+)\]/g,
    (match) => {
      const id = `inline-${ctx.footnotes.length + 1}`;
      ctx.footnotes.push({ type: "footnoteDefinition", identifier: id, label: id, children: [{ type: "paragraph", children: [text(match[1]!.trim())] }] });
      return [{ type: "footnoteReference", identifier: id, label: id }];
    },
    startsLine,
  );
  // 인용 [@키]
  nodes = rewrite(
    nodes,
    new RegExp(CITATION_IN_TEXT_SOURCE, "g"),
    (match) => {
      const source = normalizeCitationSource(match[1]);
      if (source === null || citationKeys(source).length === 0) return null;
      return [{ type: "extraMark", children: [text(`[${source}]`)], data: { hName: "cite", hProperties: { className: ["md-citation"], "data-citation": source } } }];
    },
    startsLine,
  );
  // 태그 #이름 (줄 처음이나 공백 뒤)
  nodes = rewrite(
    nodes,
    new RegExp(TAG_IN_TEXT_SOURCE, "gu"),
    (match, atStart) => {
      const name = normalizeTag(match[1]);
      if (name === null || isSkippedTag(name, BLOG_EXTRAS)) return null;
      // 정규식의 lookbehind는 글자 노드 시작을 줄 처음으로 보므로, 앞이 공백이 아닌 노드의 처음은 걸러낸다.
      if (match.index === 0 && !atStart) return null;
      return [{ type: "extraMark", children: [text(`#${name}`)], data: { hName: "span", hProperties: { className: ["md-tag"], "data-tag": name } } }];
    },
    startsLine,
  );
  // 마크: ==하이라이트==, ++삽입++, ^위첨자^
  for (const [regex, tag] of [
    [/(?<![=\\])==(?![\s=])([^=\n]+?)(?<!\s)==(?!=)/g, "mark"],
    [/(?<![+\\])\+\+(?![\s+])([^+\n]+?)(?<!\s)\+\+(?!\+)/g, "ins"],
    [/(?<![\\^[])\^([^\s^\n[\]]+)\^/g, "sup"],
  ] as const) {
    nodes = rewrite(nodes, regex, (match) => [extraMark(tag, tag === "ins" ? { className: ["md-ins"] } : {}, [text(match[1]!)])], startsLine);
  }
  // 이모지 :smile:
  return nodes.map((node) => (node.type === "text" && typeof node.value === "string" ? { ...node, value: replaceEmojiShortcodes(node.value) } : node));
}

/** 줄(글자 노드의 `\n`과 `break` 노드 기준)로 나눈 문단 안쪽. */
function toLines(children: Node[]): Node[][] {
  const lines: Node[][] = [[]];
  for (const node of children) {
    if (node.type === "break") {
      lines.push([]);
    } else if (node.type === "text" && typeof node.value === "string" && node.value.includes("\n")) {
      node.value.split("\n").forEach((piece, i) => {
        if (i > 0) lines.push([]);
        if (piece !== "") lines[lines.length - 1]!.push(text(piece));
      });
    } else {
      lines[lines.length - 1]!.push(node);
    }
  }
  return lines;
}

const DETAIL = /^:[ \t]+/;
const startsWithDetail = (line: Node[]): boolean => line[0]?.type === "text" && DETAIL.test(line[0].value ?? "");
const stripDetail = (line: Node[]): Node[] => [{ ...line[0]!, value: (line[0]!.value ?? "").replace(DETAIL, "") }, ...line.slice(1)].filter((node) => node.type !== "text" || node.value !== "");

/** 문단 하나가 정의 목록(`용어` 다음 줄 `: 설명`, 이어지는 줄은 앞 설명에 붙는다)이면 정의 목록 노드, 아니면 null. */
function toDefinitionList(paragraph: Node): Node | null {
  const lines = toLines(paragraph.children ?? []).filter((line) => line.length > 0);
  if (lines.length < 2 || startsWithDetail(lines[0]!) || !startsWithDetail(lines[1]!)) return null;
  const content: Node[] = [];
  let i = 0;
  while (i < lines.length) {
    const term = lines[i]!;
    if (startsWithDetail(term) || !lines[i + 1] || !startsWithDetail(lines[i + 1]!)) return null;
    content.push({ type: "definitionTerm", children: term, data: { hName: "dt" } });
    i += 1;
    while (i < lines.length && startsWithDetail(lines[i]!)) {
      const detail = stripDetail(lines[i]!);
      i += 1;
      // 이어지는 줄(들여쓴 줄)은 설명 안의 줄바꿈이다.
      while (i < lines.length && !startsWithDetail(lines[i]!) && !(lines[i + 1] && startsWithDetail(lines[i + 1]!))) {
        detail.push({ type: "break" }, ...lines[i]!);
        i += 1;
      }
      content.push({ type: "definitionDetail", children: detail, data: { hName: "dd" } });
    }
  }
  return { type: "definitionList", children: content, data: { hName: "dl", hProperties: { className: ["md-dl"] } } };
}

function transform(parent: Node, ctx: Context): void {
  const children = parent.children;
  if (!children) return;

  // 블록: 목차 [toc]와 정의 목록은 문단 하나가 통째로 그것일 때만이다.
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if (child.type !== "paragraph") continue;
    const only = child.children?.length === 1 && child.children[0]!.type === "text" ? (child.children[0]!.value ?? "").trim() : null;
    if (only !== null && /^\[toc\]$/i.test(only)) {
      children[i] = { type: "toc", data: { hName: "div", hProperties: { className: ["md-toc"], "data-toc": "" } }, position: child.position } as Node;
      continue;
    }
    const list = toDefinitionList(child);
    if (list) children[i] = { ...list, position: child.position } as Node;
  }

  const skip = (child: Node) => ["code", "inlineCode", "html", "math", "inlineMath"].includes(child.type);
  const phrasing = PHRASING_CONTAINERS.has(parent.type) || parent.type === "definitionTerm" || parent.type === "definitionDetail";
  // 인라인 HTML 서식 태그 짝을 먼저 틀로 묶는다(틀 안의 글자도 아래에서 같이 읽히도록).
  if (phrasing) parent.children = wrapHtmlPairs(children);
  for (const child of parent.children!) {
    if (!skip(child)) transform(child, ctx);
  }
  if (phrasing) {
    // 이 틀의 첫 글자만 줄 처음이다(굵게 같은 안쪽 서식 속 글자는 줄 처음이 아니다).
    const startsLine = parent.type === "paragraph" || parent.type === "heading" || parent.type === "definitionTerm" || parent.type === "definitionDetail";
    parent.children = inlineText(parent.children!, ctx, startsLine);
  }

  // 주석만 있던 문단은 비어 있으니 지운다.
  if (parent.type === "root" || parent.type === "blockquote" || parent.type === "listItem") {
    parent.children = parent.children!.filter((child) => !(child.type === "paragraph" && (child.children?.length ?? 0) === 0));
  }
}

/** 추가 문법을 읽는 remark 플러그인. 인라인 각주는 문서 끝에 각주 정의를 더한다. */
export function remarkExtraSyntax() {
  return (tree: Root) => {
    const ctx: Context = { footnotes: [] };
    transform(tree as unknown as Node, ctx);
    tree.children.push(...(ctx.footnotes as unknown as RootContent[]));
  };
}
