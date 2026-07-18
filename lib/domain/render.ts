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

// ---------- 커스텀 디렉티브: ::youtube[영상ID], ::post{slug=...}, ::series{id=...}, :::note ~ ::: ----------

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;
const EMBED_POST_SLUG_PATTERN = /^[a-z0-9-]{1,100}$/;
const EMBED_SERIES_ID_PATTERN = /^[1-9][0-9]*$/;

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

function youtubeEmbed(node: DirectiveNode): void {
  // ::youtube[dQw4w9WgXcQ] 또는 ::youtube{id=dQw4w9WgXcQ}
  const label = node.children
    .map((c) => (c.type === "text" ? (c.value ?? "") : ""))
    .join("")
    .trim();
  const id = node.attributes?.id ?? label;

  if (!id || !YOUTUBE_ID_PATTERN.test(id)) {
    node.data = {
      hName: "p",
      hChildren: [{ type: "text", value: "[youtube: 잘못된 영상 ID]" }],
    };
    return;
  }

  // 허용 도메인 고정(youtube-nocookie) — 임의 iframe 주입 불가
  node.data = {
    hName: "div",
    hProperties: { className: ["video-embed"] },
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

function remarkCustomDirectives() {
  return (tree: MdastRoot) => {
    visit(tree, (node) => {
      const directive = node as unknown as DirectiveNode;
      if (directive.type === "leafDirective" && directive.name === "youtube") {
        youtubeEmbed(directive);
      } else if (directive.type === "leafDirective" && directive.name === "post") {
        postEmbed(directive);
      } else if (directive.type === "leafDirective" && directive.name === "series") {
        seriesEmbed(directive);
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

/** 게시 뷰용 HTML 생성. heading_tree는 저장된 JSON을 그대로 쓰고(스펙 4.1), 본문만 여기서 변환한다. */
export async function renderPostHtml(contentMd: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath) // $인라인$, $$블록$$ 수식
    .use(remarkDirective)
    .use(remarkCustomDirectives)
    .use(remarkRehype)
    .use(rehypeKatex) // 수식을 KaTeX HTML로 변환 (수식 오류 시 빨간 원문 표시)
    .use(rehypeSanitizeUrls)
    .use(rehypeSectionWrap)
    .use(rehypeShikiHighlight)
    .use(rehypeStringify)
    .process(contentMd);
  return String(file);
}
