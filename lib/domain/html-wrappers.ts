import type { RootContent } from "mdast";

/**
 * Obsidian/GitHub에서도 그대로 보이는 HTML 래퍼 두 가지를 읽는다. 둘 다 여는 줄과 닫는 줄(`</div>`)이 각각 빈 줄로 둘러싸인 최상위 HTML 블록이어야 한다
 * (CommonMark의 HTML 블록은 빈 줄에서 끝나므로, 안쪽 Markdown은 평소처럼 읽힌다 — 에디터가 내보내는 모양도 같다).
 *
 * - `<div align="center|right">` : 정렬. 안의 헤딩은 문서 최상위로 끌어올려 접기/목차 대상이 되게 한다(래퍼는 헤딩 앞뒤로 쪼개진다).
 * - `<div data-fold="2~6|none">` : 접기 소속 오버라이드(render.ts의 wrapSections가 읽는다). 안의 헤딩은 끌어올리지 않는다.
 *
 * 닫히지 않은 여는 줄은 아무 일도 하지 않는다(그 뒤 내용이 래퍼에 먹히지 않는다). lib/domain/markdown.ts(목차)와 render.ts가 같은 규칙을 써야
 * heading_tree의 id와 본문 앵커 id가 어긋나지 않는다.
 */

export type WrapperKind = { type: "align"; value: "center" | "right" } | { type: "fold"; value: string };

export interface WrapperNode {
  type: "htmlWrapper";
  wrapper: WrapperKind;
  children: RootContent[];
  position?: RootContent["position"];
  data?: Record<string, unknown>;
}

const ALIGN_OPEN = /^<div\s+align\s*=\s*"(center|right|left)"\s*>$/i;
const FOLD_OPEN = /^<div\s+data-fold\s*=\s*"([2-6]|none)"\s*>$/i;
const CLOSE = /^<\/div>$/i;

function openKind(node: RootContent): WrapperKind | "left" | null {
  if (node.type !== "html") return null;
  const text = node.value.trim();
  const align = ALIGN_OPEN.exec(text);
  if (align) {
    const value = align[1].toLowerCase();
    return value === "left" ? "left" : { type: "align", value: value as "center" | "right" };
  }
  const fold = FOLD_OPEN.exec(text);
  return fold ? { type: "fold", value: fold[1].toLowerCase() } : null;
}

const isClose = (node: RootContent) => node.type === "html" && CLOSE.test(node.value.trim());

/** 같은 깊이의 여는/닫는 줄을 짝지어 래퍼 노드로 바꾼다(짝 없는 줄은 그대로 둔다 — 렌더 때 HTML이라 사라진다). */
export function applyHtmlWrappers(children: RootContent[]): RootContent[] {
  type Frame = { kind: WrapperKind | "left"; open: RootContent; items: RootContent[] };
  const stack: Frame[] = [];
  const base: RootContent[] = [];
  const target = () => (stack.length > 0 ? stack[stack.length - 1].items : base);

  for (const node of children) {
    const kind = openKind(node);
    if (kind !== null) {
      stack.push({ kind, open: node, items: [] });
      continue;
    }
    if (stack.length > 0 && isClose(node)) {
      const frame = stack.pop()!;
      const position =
        frame.open.position && node.position ? { start: frame.open.position.start, end: node.position.end } : undefined;
      if (frame.kind === "left") {
        // 왼쪽 정렬은 기본이라 래퍼 없이 내용만 둔다.
        target().push(...frame.items);
      } else if (frame.kind.type === "align") {
        target().push(...splitAtHeadings(frame.kind, frame.items, position));
      } else {
        target().push({ type: "htmlWrapper", wrapper: frame.kind, children: frame.items, position } as unknown as RootContent);
      }
      continue;
    }
    target().push(node);
  }

  // 닫히지 않은 여는 줄: 래퍼를 만들지 않고 안쪽 내용을 원래 자리에 풀어 둔다(여는 HTML 줄 자체는 렌더 때 사라진다).
  while (stack.length > 0) {
    const frame = stack.pop()!;
    target().push(frame.open, ...frame.items);
  }
  return base;
}

function splitAtHeadings(kind: WrapperKind, items: RootContent[], position: WrapperNode["position"]): RootContent[] {
  const result: RootContent[] = [];
  let run: RootContent[] = [];
  const flush = () => {
    if (run.length === 0) return;
    result.push({ type: "htmlWrapper", wrapper: kind, children: run, position } as unknown as RootContent);
    run = [];
  };
  for (const item of items) {
    if (item.type === "heading") {
      flush();
      result.push(item);
    } else {
      run.push(item);
    }
  }
  flush();
  return result;
}
