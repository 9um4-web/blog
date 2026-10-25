import { describe, expect, it } from "vitest";
import { extractHeadingTree, parseMarkdown } from "./markdown";
import { renderPostHtml } from "./render";

const html = (md: string) => renderPostHtml(md);

describe("추가 문법: 마크", () => {
  it("==하이라이트==·++삽입++·^위첨자^", async () => {
    const out = await html("a ==강조== b ++추가++ c x^2^");
    expect(out).toContain("<mark>강조</mark>");
    expect(out).toContain('<ins class="md-ins">추가</ins>');
    expect(out).toContain("x<sup>2</sup>");
  });

  it("<mark>·<sup>·<sub>·<ins>·<abbr>·<span style>을 짝지어 읽는다 (안전한 값만)", async () => {
    const out = await html('H<sub>2</sub>O <abbr title="Hyper Text">HTML</abbr> <span style="color: #f00">빨강</span> <span style="background-color: #fef08a">노랑</span>');
    expect(out).toContain("H<sub>2</sub>O");
    expect(out).toContain('<abbr title="Hyper Text">HTML</abbr>');
    expect(out).toContain('style="color: #ff0000"');
    expect(out).toContain('style="background-color: #fef08a"');
  });

  it("위험한 스타일·속성은 버리고 글자만 남긴다", async () => {
    const out = await html('<span style="color:expression(alert(1))" onclick="x()">글</span> <abbr title="">뜻 없음</abbr>');
    expect(out).not.toContain("expression");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("<abbr");
    expect(out).toContain("글");
  });

  it("굵게 안의 하이라이트와 코드 안의 기호", async () => {
    expect(await html("**==둘==**")).toContain("<strong><mark>둘</mark></strong>");
    expect(await html("`==x== ^y^ ++z++`")).toContain("<code>==x== ^y^ ++z++</code>");
  });

  it("짝이 없는 태그와 어긋난 중첩은 내용을 잃지 않는다", async () => {
    const out = await html("앞 <sup>안쪽 <sub>더 안쪽</sup> 뒤");
    expect(out).toContain("안쪽");
    expect(out).toContain("더 안쪽");
    expect(out).toContain("뒤");
  });
});

describe("추가 문법: 주석·태그·인용·각주·이모지", () => {
  it("주석은 보이지 않고 주석만 있는 문단은 사라진다", async () => {
    const out = await html("앞 %%비밀%% 뒤\n\n%%\n여러 줄\n주석\n%%\n\n끝");
    expect(out).not.toContain("비밀");
    expect(out).not.toContain("여러 줄");
    expect(out).toContain("앞  뒤");
    expect(out.match(/<p/g)?.length).toBe(2);
  });

  it("#태그는 줄 처음이나 공백 뒤에서만", async () => {
    const out = await html("#할일 과 #a/b 와 x#아님 과 [링크](#앵커)");
    expect(out.match(/class="md-tag"/g)?.length).toBe(2);
    expect(out).toContain('data-tag="할일"');
    expect(out).toContain('href="#%EC%95%B5%EC%BB%A4"');
  });

  it("[@키] 인용", async () => {
    const out = await html("보라 [@smith2020; @doe2021, p. 3] 와 [링크](http://x.com) 와 메일 [a@b.com]");
    expect(out).toContain('<cite class="md-citation" data-citation="@smith2020; @doe2021, p. 3">[@smith2020; @doe2021, p. 3]</cite>');
    expect(out.match(/<cite/g)?.length).toBe(1);
  });

  it("^[인라인 각주]는 각주가 된다", async () => {
    const out = await html("글^[각주 내용] 계속");
    expect(out).toContain("data-footnote-ref");
    expect(out).toContain("각주 내용");
  });

  it(":smile:은 이모지, 시간 표기는 그대로", async () => {
    const out = await html("좋아 :smile: 10:30:45");
    expect(out).toContain("😄");
    expect(out).toContain("10:30:45");
  });
});

describe("추가 문법: 정의 목록·목차", () => {
  it("용어 다음 줄의 : 설명은 dl이 된다 (이어지는 줄은 줄바꿈)", async () => {
    const out = await html("사과\n: 빨간 과일\n: 맛있다\n    이어지는 줄\n\n그냥 문단\n\n: 콜론으로 시작");
    expect(out).toContain("<dl");
    expect(out).toContain("<dt>사과</dt>");
    expect(out).toContain("<dd>빨간 과일</dd>");
    expect(out).toMatch(/<dd>맛있다<br>\s*이어지는 줄<\/dd>/);
  });

  it("목차 [toc]는 제목들로 채워지고 앵커가 본문과 같다", async () => {
    const md = "[toc]\n\n## 시작\n\n### 세부\n\n## 끝";
    const out = await html(md);
    expect(out).toContain('data-toc=""');
    expect(out).toContain('<a href="#시작">시작</a>');
    expect(out).toContain('<a href="#세부">세부</a>');
    expect(out).toContain('id="시작"');
  });

  it("목차에 각주 영역의 숨은 제목은 들어가지 않는다", async () => {
    const out = await html("[toc]\n\n## 시작\n\n각주[^1]\n\n[^1]: 내용");
    expect(out).toContain('<a href="#시작">시작</a>');
    expect(out).not.toContain('href="#footnote-label"');
  });

  it("제목이 없으면 목차 자리는 사라진다", async () => {
    expect(await html("[toc]\n\n본문")).not.toContain("md-toc");
  });
});

describe("heading_tree는 추가 문법을 포함한 제목 글자로 만든다", () => {
  it("제목 속 ==강조==·이모지가 본문 앵커와 같은 id를 낸다", async () => {
    const md = "## ==핵심== 요약 :smile:";
    const tree = extractHeadingTree(parseMarkdown(md));
    const out = await html(md);
    expect(out).toContain(`id="${tree[0]!.id}"`);
    expect(tree[0]!.text).toBe("핵심 요약 😄");
  });
});

describe("에디터 0.5 문법", () => {
  it("<kbd>는 키 표시", async () => {
    expect(await html("누르기 <kbd>Ctrl</kbd>+<kbd>C</kbd>")).toContain("<kbd>Ctrl</kbd>+<kbd>C</kbd>");
  });

  it("할 일 상태 [/] [-] [>] [?] [!]", async () => {
    const out = await html("- [ ] 일반\n- [/] 진행 중\n- [-] 취소\n- 그냥 [/] 글\n");
    expect(out).toContain('data-task-status="progress"');
    expect(out).toContain('data-task-status="cancelled"');
    expect(out).toContain('data-status="progress"');
    expect(out).toContain("진행 중");
    expect(out).not.toContain("[/] 진행 중");
    expect(out).toContain("그냥 [/] 글");
    expect(out.match(/data-task-status/g)).toHaveLength(2);
  });

  it("코드 블록 메타: 파일명 줄·강조 줄·줄 번호", async () => {
    const out = await html('```ts title="a.ts" {2} showLineNumbers\nconst a = 1;\nconst b = 2;\n```');
    expect(out).toContain('<figcaption class="code-title">a.ts</figcaption>');
    expect(out).toContain("data-line-numbers");
    expect(out).toMatch(/class="line highlighted"/);
    expect(out.match(/class="line highlighted"/g)).toHaveLength(1);
  });

  it("메타가 없는 코드 블록은 예전과 같다", async () => {
    const out = await html("```ts\nconst a = 1;\n```");
    expect(out).not.toContain("code-figure");
    expect(out).not.toContain("data-line-numbers");
  });

  it("이미지 캡션", async () => {
    const out = await html('![그림](/img/1.png "첫 번째 그림")');
    expect(out).toContain('<figure class="image-figure">');
    expect(out).toContain("<figcaption>첫 번째 그림</figcaption>");
    expect(out).not.toContain('title="');
    expect(await html("![그림](/img/1.png)")).not.toContain("figcaption");
  });
});
