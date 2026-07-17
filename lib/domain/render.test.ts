import { describe, expect, it } from "vitest";
import { extractHeadingTree, parseMarkdown } from "./markdown";
import { renderPostHtml } from "./render";

describe("renderPostHtml", () => {
  it("최상위 헤딩을 중첩 section으로 래핑한다", async () => {
    const html = await renderPostHtml(["## A", "본문", "### B", "## C"].join("\n\n"));
    expect(html).toContain('<section class="heading-section" data-heading-id="a" data-level="2">');
    expect(html).toContain('data-heading-id="b"');
    // B 섹션은 A 섹션 내부에 중첩
    const aStart = html.indexOf('data-heading-id="a"');
    const bStart = html.indexOf('data-heading-id="b"');
    const aEnd = html.indexOf('data-heading-id="c"');
    expect(bStart).toBeGreaterThan(aStart);
    expect(bStart).toBeLessThan(aEnd);
  });

  it("본문 앵커 id가 heading_tree의 id와 일치한다 (목차-본문 연동)", async () => {
    const md = ["## 개요", "## 개요", "### 상세 내용!", "본문"].join("\n\n");
    const tree = extractHeadingTree(parseMarkdown(md));
    const html = await renderPostHtml(md);

    const walk = (nodes: typeof tree): string[] =>
      nodes.flatMap((n) => [n.id, ...walk(n.children)]);
    for (const id of walk(tree)) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`data-heading-id="${id}"`);
    }
  });

  it("mermaid 코드블록을 lazy 컨테이너로 감싸고 원문을 fallback으로 유지한다 (스펙 4.2/9.2)", async () => {
    const md = ["## 다이어그램", "```mermaid", "graph TD", "  A --> B", "```"].join("\n");
    const html = await renderPostHtml(md);
    expect(html).toContain("data-mermaid");
    expect(html).toContain("language-mermaid");
    expect(html).toContain("graph TD");
  });

  it("일반 코드블록은 mermaid 컨테이너로 감싸지 않는다", async () => {
    const html = await renderPostHtml("```bash\n# comment\n```");
    expect(html).not.toContain("data-mermaid");
  });

  it("헤딩 이전의 서두 콘텐츠는 섹션 밖에 남는다", async () => {
    const html = await renderPostHtml(["서두 문단", "## A"].join("\n\n"));
    expect(html.indexOf("서두 문단")).toBeLessThan(html.indexOf("<section"));
  });

  it("GFM 테이블을 렌더링한다", async () => {
    const html = await renderPostHtml("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(html).toContain("<table>");
  });

  it("언어가 지정된 코드블록을 shiki로 하이라이팅한다", async () => {
    const html = await renderPostHtml('```ts\nconst x: number = 1;\n```');
    expect(html).toContain("shiki");
    expect(html).toContain("<span");
    expect(html).toContain("const");
  });

  it("mermaid 코드블록은 하이라이팅하지 않고 원문 텍스트를 유지한다", async () => {
    const html = await renderPostHtml("```mermaid\ngraph TD\n  A --> B\n```");
    expect(html).toContain("language-mermaid");
    expect(html).toContain("graph TD");
    // mermaid pre는 shiki로 교체되지 않아야 클라이언트가 textContent를 읽을 수 있다
    expect(html).not.toContain('class="shiki');
  });

  it("언어 미지정/미지원 코드블록은 그대로 둔다", async () => {
    const html = await renderPostHtml("```\nplain text\n```");
    expect(html).toContain("plain text");
    expect(html).not.toContain("shiki");
  });

  it("javascript:/data: 등 위험 스킴 링크의 href를 제거한다", async () => {
    const html = await renderPostHtml(
      [
        "[evil](javascript:alert(1))",
        "[evil2](data:text/html,<script>1</script>)",
        "[ok](https://example.com)",
        "[rel](/posts)",
        "[anchor](#overview)",
      ].join("\n\n"),
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="/posts"');
    expect(html).toContain('href="#overview"');
  });

  it("위험 스킴 이미지의 src를 제거한다", async () => {
    const html = await renderPostHtml("![x](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("::youtube[영상ID]를 youtube-nocookie iframe으로 변환한다", async () => {
    const html = await renderPostHtml("::youtube[dQw4w9WgXcQ]");
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain("<iframe");
    expect(html).toContain("video-embed");
  });

  it("잘못된 유튜브 ID는 iframe을 만들지 않는다", async () => {
    const html = await renderPostHtml("::youtube[ab]");
    expect(html).not.toContain("<iframe");
    expect(html).toContain("잘못된 영상 ID");
  });

  it(":::note 콜아웃을 기본 제목과 함께 렌더한다", async () => {
    const html = await renderPostHtml(":::note\n내용 문단입니다.\n:::");
    expect(html).toContain('class="callout callout-note"');
    expect(html).toContain('class="callout-title"');
    expect(html).toContain("노트");
    expect(html).toContain("내용 문단입니다.");
  });

  it(":::warning[커스텀 제목] 라벨을 제목으로 쓴다", async () => {
    const html = await renderPostHtml(":::warning[조심하세요!]\n위험한 내용.\n:::");
    expect(html).toContain("callout-warning");
    expect(html).toContain("조심하세요!");
    expect(html).not.toContain(">주의<"); // 기본 제목으로 대체되지 않음
  });

  it("알 수 없는 디렉티브는 조용히 무시된다", async () => {
    const html = await renderPostHtml("본문\n\n::unknown[x]");
    expect(html).toContain("본문");
  });

  it("$인라인$ 수식을 KaTeX로 렌더한다", async () => {
    const html = await renderPostHtml("질량-에너지 등가: $E = mc^2$");
    expect(html).toContain("katex");
    expect(html).not.toContain("$E = mc^2$"); // 원문 달러 표기가 남지 않음
  });

  it("$$블록$$ 수식을 display 모드로 렌더한다", async () => {
    const html = await renderPostHtml("$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$");
    expect(html).toContain("katex-display");
  });

  it("잘못된 수식은 에러 표시로 대체되고 나머지 본문은 렌더된다", async () => {
    const html = await renderPostHtml("본문 유지\n\n$\\frac{1}{$\n");
    expect(html).toContain("본문 유지");
  });
});
