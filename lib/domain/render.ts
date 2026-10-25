import GithubSlugger from "github-slugger";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { createHighlighter, type Highlighter } from "shiki";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";
import type { Element, ElementContent, Root, RootContent } from "hast";
import { resolveBlueskyDids } from "./bluesky";
import { parseCodeMeta } from "@gogum4/editor-schema/codeMeta";
import { isPlotLanguage, parsePlot } from "@gogum4/editor-schema/plot";
import { plotToSvg } from "@gogum4/editor-schema/plotSvg";
import { remarkExtraSyntax } from "./extras";
import { remarkObsidianSyntax } from "./obsidian";

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
   * <div data-fold> 블록 재배치: 지정한 레벨 이하의 가장 가까운 조상 섹션의 직속
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

/**
 * 목차 `[toc]`(extras.ts가 `div[data-toc]` 자리를 만든다)를 이 글의 제목들(h2~h6, 섹션 래핑이 단 id)로 채운다.
 * 섹션 래핑 뒤에 돌아야 제목에 id가 있다. 제목이 없으면 자리를 지운다.
 */
function rehypeToc() {
  return (tree: Root) => {
    const headings: Array<{ level: number; id: string; text: string }> = [];
    visit(tree, "element", (node: Element) => {
      if (!HEADING_TAGS.has(node.tagName)) return;
      const id = node.properties?.id;
      // 각주 영역의 숨은 제목("Footnotes")은 글의 제목이 아니다.
      if (typeof id === "string" && id !== "footnote-label") headings.push({ level: Number(node.tagName.slice(1)), id, text: textOf(node) });
    });
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "div" || (node.properties?.dataToc === undefined && node.properties?.["data-toc"] === undefined) || index === undefined || !parent) return;
      if (headings.length === 0) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      const top = Math.min(...headings.map((heading) => heading.level));
      node.children = [
        { type: "element", tagName: "p", properties: { className: ["md-toc-title"] }, children: [{ type: "text", value: "목차" }] },
        {
          type: "element",
          tagName: "ul",
          properties: {},
          children: headings.map((heading) => ({
            type: "element",
            tagName: "li",
            properties: { style: `margin-left: ${(heading.level - top) * 1.1}em` },
            children: [{ type: "element", tagName: "a", properties: { href: `#${heading.id}` }, children: [{ type: "text", value: heading.text }] }],
          })),
        },
      ];
    });
  };
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
      // 펜스 뒤 글(`title="a.ts" {2,4} showLineNumbers`): 강조 줄·줄 번호·파일명 줄.
      const meta = parseCodeMeta((code.data as { meta?: unknown } | undefined)?.meta);
      const marked = new Set(meta.lines);
      const hast = highlighter.codeToHast(text, {
        lang,
        themes: { light: "github-light", dark: "github-dark" },
        transformers: marked.size === 0 ? [] : [{ line(line, number) { if (marked.has(number)) this.addClassToHast(line, "highlighted"); } }],
      });
      const pre = hast.children[0];
      if (pre?.type === "element") {
        if (meta.showLineNumbers) pre.properties = { ...pre.properties, "data-line-numbers": "" };
        parent.children[index] =
          meta.title === null
            ? pre
            : {
                type: "element",
                tagName: "figure",
                properties: { className: ["code-figure"] },
                children: [{ type: "element", tagName: "figcaption", properties: { className: ["code-title"] }, children: [{ type: "text", value: meta.title }] }, pre],
              };
      }
    }
  };
}

/**
 * `plot` 코드 블록(수식 그래프)을 SVG 그림으로 바꾼다. 식은 `eval` 없이 에디터 패키지의 안전한 계산기로 계산하고, SVG 글자는 사용자 글을 모두 이스케이프해 만든다.
 * 식이 틀리면 그대로 두어 일반 코드 블록으로 보인다(글을 잃지 않는다). 3D는 처음 시점의 정지 그림이다.
 */
function rehypePlotGraphs() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "pre" || index === undefined || !parent) return;
      const code = node.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
      if (!code || !isPlotLanguage(codeLanguage(code))) return;
      const parsed = parsePlot(textOf(code).replace(/\n$/, ""));
      if (!parsed.ok) return;
      const svg = plotToSvg(parsed.spec);
      parent.children[index] = {
        type: "element",
        tagName: "figure",
        properties: { className: ["plot"] },
        // 우리가 만든 SVG라서 raw로 넣는다(rehypeStringify의 allowDangerousHtml이 이 노드만 통과시킨다 — 마크다운의 HTML은 remark-rehype가 이미 버렸다).
        children: [{ type: "raw", value: svg } as unknown as ElementContent],
      };
      return SKIP;
    });
  };
}

/** `![설명](주소 "캡션")`: 문단에 이미지만 있고 title이 있으면 `<figure>`와 `<figcaption>`으로 바꾼다(title 속성은 캡션이 되어 없어진다). */
function rehypeImageCaption() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "p" || index === undefined || !parent) return;
      const kids = node.children.filter((c) => !(c.type === "text" && c.value.trim() === ""));
      const img = kids[0];
      if (kids.length !== 1 || img?.type !== "element" || img.tagName !== "img") return;
      const title = img.properties?.title;
      if (typeof title !== "string" || title.trim() === "") return;
      const { title: _title, ...rest } = img.properties;
      void _title;
      img.properties = rest;
      parent.children[index] = {
        type: "element",
        tagName: "figure",
        properties: { className: ["image-figure"] },
        children: [img, { type: "element", tagName: "figcaption", properties: {}, children: [{ type: "text", value: title.trim() }] }],
      };
    });
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
    .use(remarkExtraSyntax)
    .use(remarkObsidianSyntax, { blueskyDids })
    .use(remarkRehype);

  if (withSourceAttrs) {
    pipeline.use(rehypeSourceLines);
  }

  const file = await pipeline
    .use(rehypeKatex) // 수식을 KaTeX HTML로 변환 (수식 오류 시 빨간 원문 표시)
    .use(rehypeSanitizeUrls)
    .use(rehypeImageResize)
    .use(rehypeImageCaption)
    .use(rehypeSectionWrap)
    .use(rehypeToc)
    .use(rehypePlotGraphs)
    .use(rehypeShikiHighlight)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(contentMd);
  return String(file);
}
