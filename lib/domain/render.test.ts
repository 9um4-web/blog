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

  it("<div align> 안의 헤딩은 자기만의 section으로 감싸져 A 섹션의 하위 섹션이 된다", async () => {
    const md = ["## A", '<div align="center">', "### B", "본문", "</div>"].join("\n\n");
    const html = await renderPostHtml(md);
    const aStart = html.indexOf('data-heading-id="a"');
    const bStart = html.indexOf('data-heading-id="b"');
    expect(bStart).toBeGreaterThan(aStart);
    // B는 정렬 래퍼 안이 아니라 독립된 section이면서 A의 하위에 위치
    expect(html.slice(aStart, bStart)).not.toContain("align-center");
    // B 헤딩 뒤의 본문 문단은 여전히 정렬 래퍼 안에 있다
    expect(html.slice(bStart, html.indexOf("본문"))).toContain("align-center");
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

  it("![](유튜브 주소)를 youtube-nocookie iframe으로 변환한다", async () => {
    const html = await renderPostHtml("![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)");
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain("<iframe");
    expect(html).toContain("video-embed");
  });

  it("youtu.be·shorts 같은 다른 모양의 유튜브 주소도 같은 iframe이 된다", async () => {
    for (const url of ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/shorts/dQw4w9WgXcQ"]) {
      expect(await renderPostHtml(`![](${url})`)).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    }
  });

  it("지원하지 않는 주소의 이미지 문법은 임베드가 아니라 평범한 이미지다", async () => {
    const html = await renderPostHtml("![](https://example.com/watch?v=dQw4w9WgXcQ)");
    expect(html).not.toContain("<iframe");
    expect(html).toContain("<img");
  });

  it("![[슬러그]]를 글 임베드 placeholder로 변환한다", async () => {
    const html = await renderPostHtml("![[hello-world]]");
    expect(html).toContain('data-embed="post"');
    expect(html).toContain('data-post-slug="hello-world"');
  });

  it("![[series/슬러그]]를 시리즈 임베드 placeholder로 변환한다", async () => {
    const html = await renderPostHtml("![[series/my-series]]");
    expect(html).toContain('data-embed="series"');
    expect(html).toContain('data-series-slug="my-series"');
  });

  it("잘못된 글/시리즈 임베드 슬러그는 안내 문구로 대체한다", async () => {
    const html = await renderPostHtml(["![[한글]]", "![[series/Bad_Slug]]"].join("\n\n"));
    expect(html).toContain("[post: 잘못된 slug]");
    expect(html).toContain("[series: 잘못된 slug]");
  });

  it("> [!note] 콜아웃을 기본 제목과 함께 렌더한다", async () => {
    const html = await renderPostHtml("> [!note]\n> 내용 문단입니다.");
    expect(html).toContain('class="callout callout-note"');
    expect(html).toContain('class="callout-title"');
    expect(html).toContain("노트");
    expect(html).toContain("내용 문단입니다.");
  });

  it("GitHub 알림(대문자)과 Obsidian 이름 모두 콜아웃이 된다", async () => {
    expect(await renderPostHtml("> [!WARNING]\n> x")).toContain("callout-warning");
    expect(await renderPostHtml("> [!rocket] 출발\n> x")).toContain("callout-rocket");
  });

  it("> [!warning] 뒤의 글은 제목이 되고 기본 제목을 대신한다", async () => {
    const html = await renderPostHtml("> [!warning] 조심하세요!\n> 위험한 내용.");
    expect(html).toContain("callout-warning");
    expect(html).toContain("조심하세요!");
    expect(html).not.toContain(">주의<");
    expect(html).toContain("위험한 내용.");
  });

  it("에디터가 내보내는 모양(> [!NOTE] 다음 줄의 굵은 글)도 제목으로 읽는다", async () => {
    const html = await renderPostHtml("> [!NOTE]\n> **제목입니다**\n>\n> 본문");
    expect(html).toContain('<div class="callout-title">제목입니다</div>');
    expect(html).toContain("제목입니다");
    expect(html).not.toContain(">노트<");
    expect(html).toContain("본문");
  });

  it("콜아웃 안의 다른 블록과 중첩 콜아웃을 렌더한다", async () => {
    const html = await renderPostHtml("> [!tip] 팁\n> 하나\n>\n> - 목록\n>\n> > [!danger]\n> > 안쪽");
    expect(html).toContain("callout-tip");
    expect(html).toContain("callout-danger");
    expect(html).toMatch(/<li>\s*(<p>)?목록/);
  });

  it("[!종류]가 아닌 인용문은 그대로 인용문이다", async () => {
    const html = await renderPostHtml("> 평범한 인용");
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("callout");
  });

  it("알 수 없는 ::디렉티브 글자는 그냥 글자다", async () => {
    const html = await renderPostHtml("본문\n\n::unknown[x]");
    expect(html).toContain("본문");
    expect(html).toContain("::unknown[x]");
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

  it('<div align="center|right"> 정렬 블록을 렌더한다', async () => {
    const html = await renderPostHtml(
      ['<div align="center">', "", "가운데 문단", "", "</div>", "", '<div align="right">', "", "오른쪽 문단", "", "</div>"].join("\n"),
    );
    expect(html).toContain('class="align-center"');
    expect(html).toContain('class="align-right"');
    expect(html).toContain("가운데 문단");
  });

  it("닫히지 않은 <div align>은 뒤의 내용을 삼키지 않는다", async () => {
    const html = await renderPostHtml(['<div align="center">', "", "내용", "", "## 다음"].join("\n"));
    expect(html).not.toContain("align-center");
    expect(html).toContain("내용");
    expect(html).toContain('data-heading-id="다음"');
  });

  it("&emsp; 두 개가 한 단계 들여쓰기, 문단과 제목에 적용된다", async () => {
    const html = await renderPostHtml("&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;들여쓴 내용");
    expect(html).toContain("margin-left: 4.5rem");
    expect(html).toContain("들여쓴 내용");
    expect(html).not.toContain("\u2003");
    const heading = await renderPostHtml("## &emsp;&emsp;제목");
    expect(heading).toContain("margin-left: 1.5rem");
  });

  it('<div data-fold="2">는 블록을 h2 섹션 직속으로 끌어올린다 (h3 접기의 영향권 밖)', async () => {
    const md = ["## 제목1", "내용 1", "### 제목 2", "내용 2", '<div data-fold="2">', "내용 3", "</div>", "### 제목 3", "이후 내용"].join("\n\n");
    const html = await renderPostHtml(md);

    // 제목 2 섹션(중첩 섹션 없음)은 자신의 </section>까지 — 내용 3을 포함하면 안 됨
    const sectionB = /<section[^>]*data-heading-id="제목-2"[^>]*>[\s\S]*?<\/section>/.exec(html)?.[0];
    expect(sectionB).toBeDefined();
    expect(sectionB).toContain("내용 2");
    expect(sectionB).not.toContain("내용 3");

    // 문서 순서 유지: 내용 3은 제목 2 섹션 뒤, 제목 3 섹션 앞
    expect(html.indexOf("내용 3")).toBeGreaterThan(html.indexOf('data-heading-id="제목-2"'));
    expect(html.indexOf("내용 3")).toBeLessThan(html.indexOf('data-heading-id="제목-3"'));

    // 이후 제목(제목 3) 섹션에 포함되지 않음
    const sectionC = /<section[^>]*data-heading-id="제목-3"[^>]*>[\s\S]*<\/section>/.exec(html)?.[0];
    expect(sectionC).not.toContain("내용 3");
  });

  it('<div data-fold="none">은 data-nofold로 어떤 접기에서도 제외된다', async () => {
    const md = ["## A", "### B", '<div data-fold="none">', "항상 보임", "</div>"].join("\n\n");
    const html = await renderPostHtml(md);
    expect(html).toContain("data-nofold");
    // 최상위 열린 섹션(A)의 직속 자식 — B 섹션 밖에 위치
    const sectionB = /<section[^>]*data-heading-id="b"[^>]*>[\s\S]*?<\/section>/.exec(html)?.[0];
    expect(sectionB).not.toContain("항상 보임");
  });

  it("fold에 현재보다 깊은 h를 지정하면 기본 소속과 동일하게 동작한다", async () => {
    const md = ["## A", '<div data-fold="6">', "그대로 A 소속", "</div>"].join("\n\n");
    const html = await renderPostHtml(md);
    // h=6 ≥ 현재(2)이므로 A 섹션 직속 = 기본 동작, nofold 아님
    const sectionA = /<section[^>]*data-heading-id="a"[^>]*>[\s\S]*<\/section>/.exec(html)?.[0];
    expect(sectionA).toContain("그대로 A 소속");
    expect(html).not.toContain("data-nofold");
  });

  it("GFM 각주를 렌더하고 문서 끝에 footnotes 섹션을 만든다", async () => {
    const html = await renderPostHtml(
      "본문 텍스트[^1] 계속.\n\n[^1]: 각주 내용입니다.",
    );
    expect(html).toContain('data-footnote-ref');
    expect(html).toContain('data-footnotes');
    expect(html).toContain("각주 내용입니다");
  });

  it("각주 섹션은 마지막으로 열린 헤딩 섹션 안에 갇히지 않고 최상위에 위치한다", async () => {
    const md = ["## 유일한 헤딩", "본문[^1]", "", "[^1]: 각주."].join("\n\n");
    const html = await renderPostHtml(md);
    const heading = /<section[^>]*data-heading-id="유일한-헤딩"[^>]*>[\s\S]*?<\/section>/.exec(
      html,
    )?.[0];
    expect(heading).not.toContain("data-footnotes");
    expect(html).toContain("data-footnotes");
  });

  it("[[슬러그|표시]]는 글 링크가 되고 표시 글을 쓴다", async () => {
    const html = await renderPostHtml("이전 글은 [[old-post|여기서 보세요]] 참고.");
    expect(html).toContain('<a href="/old-post" class="post-link">여기서 보세요</a>');
    // 문단 안에 인라인으로 들어가야 함(블록으로 분리되면 안 됨)
    expect(html).toMatch(/<p>[^<]*<a[^>]*class="post-link"[^>]*>[^<]*<\/a>[^<]*<\/p>/);
  });

  it("[[슬러그]]는 슬러그를 글자로 쓴다", async () => {
    expect(await renderPostHtml("[[fallback-slug]]")).toContain(">fallback-slug</a>");
  });

  it("슬러그 모양이 아닌 [[…]]는 링크가 아니라 글자다", async () => {
    const html = await renderPostHtml("앞 [[invalid_slug]] 뒤");
    expect(html).not.toContain("<a");
    expect(html).toContain("[[invalid_slug]]");
  });

  describe("이미지 크기 조절 (rehypeImageResize)", () => {
    it("w 또는 width 쿼리 파라미터가 있으면 이미지 width 스타일을 설정하고 height를 auto로 한다", async () => {
      const html1 = await renderPostHtml("![테스트](/images/1/pic.png?w=300)");
      expect(html1).toContain('style="width: 300px; height: auto"');

      const html2 = await renderPostHtml("![테스트](/images/1/pic.png?width=50%)");
      expect(html2).toContain('style="width: 50%; height: auto"');
    });

    it("h 또는 height 쿼리 파라미터가 있으면 이미지 height 스타일을 설정하고 width를 auto로 한다", async () => {
      const html1 = await renderPostHtml("![테스트](/images/1/pic.png?h=200)");
      expect(html1).toContain('style="height: 200px; width: auto"');

      const html2 = await renderPostHtml("![테스트](/images/1/pic.png?height=10rem)");
      expect(html2).toContain('style="height: 10rem; width: auto"');
    });

    it("width와 height가 모두 있으면 둘 다 스타일로 설정한다", async () => {
      const html = await renderPostHtml("![테스트](/images/1/pic.png?w=300&h=200)");
      expect(html).toContain('style="width: 300px; height: 200px"');
    });

    it("hash fragment(#)에 크기 지정이 있어도 올바르게 스타일로 변환한다", async () => {
      const html = await renderPostHtml("![테스트](/images/1/pic.png#w=50%&h=150)");
      expect(html).toContain('style="width: 50%; height: 150px"');
    });

    it("크기 지정 파라미터가 없거나 올바르지 않으면 style을 설정하지 않는다", async () => {
      const html1 = await renderPostHtml("![테스트](/images/1/pic.png)");
      expect(html1).not.toContain("style=");

      const html2 = await renderPostHtml("![테스트](/images/1/pic.png?other=123)");
      expect(html2).not.toContain("style=");
    });
  });

  describe("접을 수 있는 콜아웃", () => {
    it("[!note]-는 접힌 채, [!note]+는 펼친 채인 <details>가 된다", async () => {
      const closed = await renderPostHtml("> [!note]- 접힌 제목\n> 내용");
      expect(closed).toContain('<details class="callout callout-note"><summary class="callout-title">접힌 제목</summary>');
      expect(closed).not.toContain("open");
      const open = await renderPostHtml("> [!tip]+\n> 내용");
      expect(open).toMatch(/<details class="callout callout-tip" open[^>]*><summary class="callout-title">팁<\/summary>/);
    });
  });

  describe("임베드 위젯 크기 및 렌더링", () => {
    it("![|500x300](유튜브)는 가로·세로를 인라인 스타일로 변환한다", async () => {
      const html = await renderPostHtml("![|500x300](https://youtu.be/dQw4w9WgXcQ)");
      expect(html).toContain('style="width: 500px; height: 300px; aspect-ratio: auto"');
      expect(html).toContain('data-embed-type="youtube"');
    });

    it("범위 밖 크기(100~2000 밖)는 무시하고 기본 크기를 쓴다", async () => {
      const html = await renderPostHtml("![|5000](https://youtu.be/dQw4w9WgXcQ)");
      expect(html).toContain('style="width: 100%; aspect-ratio: 16 / 9"');
    });

    it("![|600](영상.mp4)는 height를 지정하지 않고 aspect-ratio를 유지한다", async () => {
      const html = await renderPostHtml("![|600](https://example.com/video.mp4)");
      expect(html).toContain('style="width: 600px; aspect-ratio: 16 / 9"');
      expect(html).toContain("<video");
    });

    it("X·SoundCloud·Instagram·Pinterest·Bluesky 주소가 올바른 iframe으로 렌더링된다", async () => {
      const xHtml = await renderPostHtml("![](https://x.com/user/status/123456)");
      expect(xHtml).toContain('src="https://platform.twitter.com/embed/Tweet.html?id=123456"');

      const scHtml = await renderPostHtml("![](https://soundcloud.com/artist/track)");
      expect(scHtml).toContain('src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Ftrack');

      const instaHtml = await renderPostHtml("![](https://www.instagram.com/p/ABCDEFG/)");
      expect(instaHtml).toContain('src="https://www.instagram.com/p/ABCDEFG/embed/captioned/"');

      const pinHtml = await renderPostHtml("![](https://www.pinterest.com/pin/9876543/)");
      expect(pinHtml).toContain('src="https://assets.pinterest.com/ext/embed.html?id=9876543"');

      // DID 형태 URL은 네트워크 해석 없이 그대로 embed 주소가 된다
      const bskyHtml = await renderPostHtml("![](https://bsky.app/profile/did:plc:z72i7hdynmk6r22z27h6tvur/post/rkey123)");
      expect(bskyHtml).toContain('src="https://embed.bsky.app/embed/did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/rkey123?id=rkey123"');
    });

    it("문장 속 이미지는 임베드가 되지 않는다 (한 줄에 이미지 하나뿐일 때만)", async () => {
      const html = await renderPostHtml("앞 ![](https://youtu.be/dQw4w9WgXcQ) 뒤");
      expect(html).not.toContain("<iframe");
    });
  });
});
