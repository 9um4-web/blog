import { docToMarkdown, type ImportContext } from "@gogum4/editor-markdown";
import { formatEmbedLine, type EmbedLine, parseEmbedLine } from "@/lib/post-embeds";

// 시각 편집기(components/admin/wysiwyg-editor.tsx)가 마크다운을 읽고 쓰는 규칙. 화면 없이 시험할 수 있게 순수 함수로 따로 둔다.

const POST_SLUG = /^[a-z0-9-]{1,100}$/;

export const IMPORT_CONTEXT: ImportContext = {
  // `[[슬러그|텍스트]]`는 글 링크 노드(pageLink, pageId = 슬러그)가 된다. 슬러그 모양이 아니면 글자로 둔다.
  resolvePage: (target) => (POST_SLUG.test(target.trim().toLowerCase()) ? target.trim().toLowerCase() : null),
  resolveImage: () => null,
  // 콜아웃·수식·각주는 Obsidian대로 읽고, 이미지·HTML·열 정렬 표는 원문으로 보존한다(블로그 이미지는 URL이라 에디터 이미지 노드를 쓰지 않는다).
  profile: { rawEmbeds: true, keepAnyHref: true, mdLinksToPages: false },
  embeds: true,
  indent: true,
  references: (line) => {
    const embed = parseEmbedLine(line);
    return embed === null ? null : { kind: embed.kind, id: embed.slug };
  },
};

/** 에디터의 문서(JSON)를 마크다운으로. 글·시리즈 카드는 `![[…]]`로 쓴다. */
export function exportMarkdown(json: Parameters<typeof docToMarkdown>[0]): string {
  return docToMarkdown(json, {
    pageTitle: (pageId) => pageId,
    references: {
      toMarkdown: (kind, id) => (kind === "post" || kind === "series" ? formatEmbedLine({ kind, slug: id }) : undefined),
    },
  }).markdown;
}

/**
 * `/임베드`에 붙여 넣은 글을 우리 사이트의 글·시리즈로 알아본다: `my-post`, `series/my-series`, `![[…]]`, 사이트 주소(`/my-post`, `/series/my-series`).
 * 다른 사이트의 주소와 슬러그가 아닌 글은 null(외부 공급자 임베드는 패키지가 먼저 알아본다).
 */
export function parseBlogEmbedInput(input: string, origin: string): { kind: EmbedLine["kind"]; id: string } | null {
  const text = input.trim();
  let path = text;
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      if (url.origin !== origin) return null;
      path = url.pathname.replace(/^\/+|\/+$/g, "");
    } catch {
      return null;
    }
  }
  const embed = parseEmbedLine(text.startsWith("![[") ? text : `![[${path.replace(/^\/+/, "")}]]`);
  return embed === null ? null : { kind: embed.kind, id: embed.slug };
}
