// 시각 편집기의 `::post{slug=…}` / `::series{id=…}` 원문 상자 아래에 카드 미리보기를 붙이는 확장.
// 패키지의 `raw` 노드는 원문만 보여 주므로, 노드 뒤에 위젯 데코레이션을 얹는다. 문서(마크다운)는 건드리지 않는다.
import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { createRoot, type Root } from "react-dom/client";
import { parseEmbedLine } from "@/lib/post-embeds";
import { EmbedCardPreview } from "./embed-card-preview";

const roots = new WeakMap<HTMLElement, Root>();

function createWidget(text: string): HTMLElement {
  const embed = parseEmbedLine(text);
  const dom = document.createElement("div");
  dom.className = "md-embed-preview not-prose";
  dom.contentEditable = "false";
  if (embed !== null) {
    const root = createRoot(dom);
    roots.set(dom, root);
    root.render(<EmbedCardPreview embed={embed} />);
  }
  return dom;
}

function destroyWidget(dom: Node): void {
  const root = roots.get(dom as HTMLElement);
  if (root === undefined) return;
  roots.delete(dom as HTMLElement);
  // 렌더 도중에 unmount하면 React가 경고하므로 한 박자 늦춘다.
  queueMicrotask(() => root.unmount());
}

function decorate(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "raw") return;
    const text = String(node.attrs.text ?? "");
    if (parseEmbedLine(text) === null) return;
    // key에 원문을 넣어서, 원문을 고치면 위젯을 새로 만들고 그대로면 재사용한다.
    decorations.push(
      Decoration.widget(pos + node.nodeSize, () => createWidget(text), {
        key: `embed:${text.trim()}`,
        side: -1,
        destroy: destroyWidget,
      }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

export const EmbedPreview = Extension.create({
  name: "blogEmbedPreview",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blogEmbedPreview"),
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
