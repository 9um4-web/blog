import GithubSlugger from "github-slugger";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { createHighlighter, type Highlighter } from "shiki";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { Element, ElementContent, Root, RootContent } from "hast";

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

  for (const child of root.children) {
    const isHeading = child.type === "element" && HEADING_TAGS.has(child.tagName);

    if (!isHeading) {
      push(child.type === "element" && isMermaidPre(child) ? wrapMermaid(child) : child);
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
    themes: ["github-light"],
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
      const hast = highlighter.codeToHast(text, { lang, theme: "github-light" });
      const pre = hast.children[0];
      if (pre?.type === "element") {
        parent.children[index] = pre;
      }
    }
  };
}

/** 게시 뷰용 HTML 생성. heading_tree는 저장된 JSON을 그대로 쓰고(스펙 4.1), 본문만 여기서 변환한다. */
export async function renderPostHtml(contentMd: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitizeUrls)
    .use(rehypeSectionWrap)
    .use(rehypeShikiHighlight)
    .use(rehypeStringify)
    .process(contentMd);
  return String(file);
}
