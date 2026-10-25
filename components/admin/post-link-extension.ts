// 시각 편집기의 글 링크 `[[슬러그|표시할 텍스트]]`: 에디터 패키지의 `pageLink` 노드 이름을 블로그가 직접 정의한다
// (패키지의 마크다운 읽기·쓰기가 위키 링크를 이 이름의 노드로 다루고, 위키 기능은 core에 넣지 않는 것이 패키지의 규칙이다).
// `pageId`는 글 슬러그, `label`은 표시할 텍스트(없으면 슬러그). 글자가 아니라 한 덩어리(atom)다.
import { mergeAttributes, Node } from "@tiptap/core";

export const PostLink = Node.create({
  name: "pageLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-page-id"),
        renderHTML: (attributes) => (attributes.pageId ? { "data-page-id": attributes.pageId } : {}),
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-label"),
        renderHTML: (attributes) => (attributes.label ? { "data-label": attributes.label } : {}),
      },
      // 패키지가 블록 링크용으로 채워 줄 수 있는 속성이라 받아만 둔다(블로그는 쓰지 않는다).
      blockId: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-post-link]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-post-link": "", class: "md-post-link" }, HTMLAttributes), String(node.attrs.label || node.attrs.pageId || "")];
  },
});
