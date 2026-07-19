import GithubSlugger from "github-slugger";
import { toString } from "mdast-util-to-string";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { Root } from "mdast";

/** heading_tree 노드 구조 (스펙 2장). 본문 최상위는 노드 배열(forest). */
export interface HeadingNode {
  id: string;
  text: string;
  level: number;
  children: HeadingNode[];
}

export function parseMarkdown(contentMd: string): Root {
  // directive/math를 함께 파싱해 ::: 나 $$ 원문이 문단 텍스트로 새지 않게 한다
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).use(remarkMath);
  return processor.runSync(processor.parse(contentMd)) as Root;
}

/**
 * :::indent/:::center/:::right는 순수 시각적 래퍼라, 안에 헤딩이 있어도 접기/목차
 * 대상이 되어야 한다 — 헤딩을 기준으로 컨테이너를 여러 조각으로 쪼개 헤딩만 문서
 * 최상위로 끌어올린다(그 외 내용은 원래 컨테이너에 남아 스타일 유지).
 * :::note 같은 의미 있는 콜아웃, fold 오버라이드는 대상 아님. 최상위에 직접 있는
 * 컨테이너만 처리 — 다른 블록 안에 중첩된 경우는 기존과 동일하게 제외된다.
 */
const TRANSPARENT_CONTAINER_NAMES = new Set(["indent", "center", "right"]);

interface ContainerDirectiveNode {
  type: "containerDirective";
  name: string;
  children: unknown[];
}

function isTransparentContainer(node: unknown): node is ContainerDirectiveNode {
  const n = node as { type?: string; name?: string; children?: unknown };
  return (
    n.type === "containerDirective" &&
    typeof n.name === "string" &&
    TRANSPARENT_CONTAINER_NAMES.has(n.name) &&
    Array.isArray(n.children)
  );
}

export function flattenTransparentContainers<T extends { type: string }>(children: T[]): T[] {
  const result: T[] = [];

  for (const node of children) {
    if (!isTransparentContainer(node)) {
      result.push(node);
      continue;
    }

    let run: unknown[] = [];
    const flushRun = () => {
      if (run.length === 0) return;
      result.push({ ...node, children: run } as T);
      run = [];
    };
    for (const child of node.children) {
      if ((child as { type: string }).type === "heading") {
        flushRun();
        result.push(child as T);
      } else {
        run.push(child);
      }
    }
    flushRun();
  }

  return result;
}

/**
 * 루트 직속 heading 노드에서 heading_tree를 만든다.
 *
 * - h1은 무시 (제목은 Post.title로 별도 관리, 스펙 3.3)
 * - level 값은 실제 마크다운 레벨(2~6)을 그대로 보존
 * - 트리 부모 = 직전에 등장한, 자신보다 낮은 level의 가장 가까운 헤딩 (레벨 스킵 대응, 스펙 3.4)
 * - 앵커 id는 텍스트 slug + 중복 시 -1, -2 dedup (스펙 3.5)
 * - 인용문/리스트 내부의 헤딩은 섹션 접기 단위가 될 수 없으므로 제외
 * - :::indent/:::center/:::right 안의 헤딩은 flattenTransparentContainers로 최상위로
 *   끌어올려진 뒤 이 함수에 들어오므로 정상적으로 포함된다
 */
export function extractHeadingTree(root: Root): HeadingNode[] {
  const slugger = new GithubSlugger();
  const forest: HeadingNode[] = [];
  const stack: HeadingNode[] = [];
  const children = flattenTransparentContainers(root.children);

  for (const node of children) {
    if (node.type !== "heading" || node.depth === 1) continue;

    const text = toString(node);
    const item: HeadingNode = {
      id: slugger.slug(text),
      text,
      level: node.depth,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      forest.push(item);
    } else {
      stack[stack.length - 1].children.push(item);
    }
    stack.push(item);
  }

  return forest;
}

/**
 * 목록 카드용 발췌문: 최상위 문단 텍스트만 이어붙여 maxLength에서 자른다.
 * 헤딩/코드블록/디렉티브(콜아웃·유튜브)/수식 블록은 제외 — 마크다운 기호가
 * 아닌 읽을 수 있는 본문만 남는다.
 */
export function excerptFromMarkdown(contentMd: string, maxLength = 160): string {
  const root = parseMarkdown(contentMd);
  const parts: string[] = [];
  let length = 0;

  for (const node of root.children) {
    if (node.type !== "paragraph") continue;
    const text = toString(node).replace(/\s+/g, " ").trim();
    if (text.length === 0) continue;
    parts.push(text);
    length += text.length;
    if (length >= maxLength) break;
  }

  const joined = parts.join(" ");
  return joined.length > maxLength ? `${joined.slice(0, maxLength).trimEnd()}…` : joined;
}

export type ParseResult =
  | { ok: true; headingTree: HeadingNode[] }
  | { ok: false; error: string };

/** 저장 시점 동기 파싱 (스펙 3장). 실패해도 throw하지 않고 에러 메시지를 돌려준다. */
export function parseForSave(contentMd: string): ParseResult {
  try {
    const root = parseMarkdown(contentMd);
    return { ok: true, headingTree: extractHeadingTree(root) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
