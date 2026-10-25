import { markdownToDoc } from "@gogum4/editor-markdown";
import { describe, expect, it } from "vitest";
import { renderPostHtml } from "./domain/render";
import { exportMarkdown, IMPORT_CONTEXT, parseBlogEmbedInput } from "./wysiwyg-markdown";

const roundTrip = (md: string) => exportMarkdown(markdownToDoc(md, IMPORT_CONTEXT, "").doc);
const normalize = (html: string) => html.replace(/data-sl="\d+" data-el="\d+"/g, "").replace(/\s+/g, " ");

/** 새 문법으로 쓴 글을 시각 편집기가 열었다 내보내도 공개 페이지 모양이 같아야 한다 */
const SAMPLE = [
  "서두 문단입니다. **굵게**와 [링크](/other-post)와 [[old-post|옛 글]].",
  "## 첫 섹션",
  "> [!NOTE]\n> **직접 정한 제목**\n>\n> 본문 내용",
  "> [!rocket]\n> 자유 이름 콜아웃",
  "![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)",
  "![|500x300](https://x.com/jack/status/20)",
  "![[hello-world]]",
  "![[series/my-series]]",
  "&emsp;&emsp;&emsp;&emsp;들여쓴 문단",
  "## &emsp;&emsp;들여쓴 제목",
  "![사진](/images/1/pic.png?w=300)",
  "![](https://example.com/clip.mp4)",
  '<div align="center">\n\n가운데 문단\n\n</div>',
  "| a | b |\n| :-: | - |\n| 1 | 2 |",
  "$$\nE = mc^2\n$$",
  "각주 문장[^1]\n\n[^1]: 각주 내용",
  "```ts\nconst a = 1;\n```",
].join("\n\n") + "\n";

describe("시각 편집기의 마크다운 왕복", () => {
  it("열었다 내보내도 공개 페이지 모양이 같다", async () => {
    const out = roundTrip(SAMPLE);
    expect(normalize(await renderPostHtml(out))).toBe(normalize(await renderPostHtml(SAMPLE)));
  });

  it("두 번째부터는 글자까지 같다 (멱등)", () => {
    const once = roundTrip(SAMPLE);
    expect(roundTrip(once)).toBe(once);
  });

  it("[[슬러그|텍스트]]는 글 링크 노드(pageLink)가 되고 같은 글자로 돌아온다", () => {
    const md = "앞 [[old-post|옛 글]] 중간 [[bare-slug]] 뒤\n";
    const doc = markdownToDoc(md, IMPORT_CONTEXT, "").doc;
    expect(JSON.stringify(doc)).toContain('"type":"pageLink"');
    expect(JSON.stringify(doc)).toContain('"pageId":"old-post"');
    expect(exportMarkdown(doc)).toBe(md);
  });

  it("Bluesky 주소도 임베드 노드가 된다", () => {
    const doc = markdownToDoc("![](https://bsky.app/profile/alice.bsky.social/post/3kabc123xyz)", IMPORT_CONTEXT, "").doc;
    expect(doc.content).toMatchObject([{ type: "embed", attrs: { provider: "bluesky" } }]);
  });

  it("글·시리즈 카드는 참조 노드가 되어 ![[…]]로 돌아온다", () => {
    const doc = markdownToDoc("![[hello-world]]\n\n![[series/my-series]]", IMPORT_CONTEXT, "").doc;
    expect(doc.content).toMatchObject([
      { type: "reference", attrs: { kind: "post", id: "hello-world" } },
      { type: "reference", attrs: { kind: "series", id: "my-series" } },
    ]);
    expect(exportMarkdown(doc)).toBe("![[hello-world]]\n\n![[series/my-series]]\n");
  });

  it("외부 임베드와 들여쓰기·콜아웃은 구조 노드가 된다", () => {
    const doc = markdownToDoc("![|500x300](https://youtu.be/dQw4w9WgXcQ)\n\n&emsp;&emsp;문단\n\n> [!tip]\n> 팁", IMPORT_CONTEXT, "").doc;
    expect(doc.content).toMatchObject([
      { type: "embed", attrs: { provider: "youtube", width: 500, height: 300 } },
      { type: "paragraph", attrs: { indent: 1 } },
      { type: "callout", attrs: { type: "tip" } },
    ]);
  });

  it("이미지·HTML·열 정렬 표는 원문으로 보존된다", () => {
    const md = "![사진](/images/1/pic.png?w=300)\n\n<div align=\"center\">\n\n가운데\n\n</div>\n\n| a | b |\n| :-: | - |\n| 1 | 2 |\n";
    const out = roundTrip(md);
    expect(out).toContain("![사진](/images/1/pic.png?w=300)");
    expect(out).toContain("| :-: | - |");
  });
});

describe("parseBlogEmbedInput", () => {
  const origin = "https://blog.example.com";
  it("슬러그·시리즈·![[…]]·사이트 주소를 알아본다", () => {
    expect(parseBlogEmbedInput("my-post", origin)).toEqual({ kind: "post", id: "my-post" });
    expect(parseBlogEmbedInput("series/my-series", origin)).toEqual({ kind: "series", id: "my-series" });
    expect(parseBlogEmbedInput("![[my-post]]", origin)).toEqual({ kind: "post", id: "my-post" });
    expect(parseBlogEmbedInput("https://blog.example.com/my-post", origin)).toEqual({ kind: "post", id: "my-post" });
    expect(parseBlogEmbedInput("https://blog.example.com/series/my-series/", origin)).toEqual({ kind: "series", id: "my-series" });
  });

  it("다른 사이트와 슬러그가 아닌 글은 null", () => {
    expect(parseBlogEmbedInput("https://evil.com/my-post", origin)).toBeNull();
    expect(parseBlogEmbedInput("한글 제목", origin)).toBeNull();
    expect(parseBlogEmbedInput("", origin)).toBeNull();
    expect(parseBlogEmbedInput("https://blog.example.com/a/b", origin)).toBeNull();
  });
});
