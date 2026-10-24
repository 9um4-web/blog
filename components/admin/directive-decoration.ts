// 시각 모드에서 `:::indent{n=…}` / `:::fold{h=…}` 컨테이너가 공개 페이지와 비슷한 모양으로 보이게 하는 확장.
// 패키지의 `directive` 노드는 여는 줄을 입력칸에만 보여 주고 의미(들여쓰기 폭·접기 소속)는 모르므로, 노드 데코레이션으로 속성만 얹는다.
// 문서(마크다운)는 건드리지 않는다 — 화면에만 영향을 준다. 들여쓰기 폭 규칙은 lib/domain/render.ts의 indentBlock과 같다(n=1~8, 1.5rem 단위).
import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

const HEAD = /^:{3,}(indent|fold)\b(?:\{([^}]*)\})?/;

function attribute(body: string | undefined, key: string): string | undefined {
  return body?.match(new RegExp(`(?:^|[\\s,])${key}=("?)([^\\s,"}]*)\\1`))?.[2];
}

export function decorationFor(head: string): Record<string, string> | null {
  const match = HEAD.exec(head);
  if (match === null) return null;
  if (match[1] === "indent") {
    const raw = Number(attribute(match[2], "n") ?? attribute(match[2], "level") ?? 1);
    const n = Number.isInteger(raw) ? Math.min(Math.max(raw, 1), 8) : 1;
    return { class: "md-directive-indent", style: `margin-left: ${n * 1.5}rem` };
  }
  const h = attribute(match[2], "h") ?? "none";
  return { class: "md-directive-fold", "data-fold": /^[2-6]$/.test(h) ? h : "none" };
}

function decorate(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "directive") return;
    const attrs = decorationFor(String(node.attrs.head ?? ""));
    if (attrs !== null) decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs));
  });
  return DecorationSet.create(doc, decorations);
}

export const DirectiveDecoration = Extension.create({
  name: "blogDirectiveDecoration",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blogDirectiveDecoration"),
        state: {
          init: (_config, state) => decorate(state.doc),
          apply: (tr, previous) => (tr.docChanged ? decorate(tr.doc) : previous),
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
