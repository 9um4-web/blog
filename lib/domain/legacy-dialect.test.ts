import { describe, expect, it } from "vitest";
import { migrateLegacyDialect } from "./legacy-dialect";

const options = { seriesSlugById: new Map([[3, "my-series"]]) };
const migrate = (md: string) => migrateLegacyDialect(md, options);

describe("migrateLegacyDialect", () => {
  it("방언이 없는 글은 한 글자도 바꾸지 않는다", () => {
    const md = "## 제목\n\n문단\n\n- 목록\n\n```ts\n::youtube[x]\n:::note\n```\n\n$$\n:::note\n$$\n";
    const result = migrate(md);
    expect(result.markdown).toBe(md);
    expect(result.changed).toBe(false);
    expect(result.notices).toEqual([]);
  });

  it("임베드 리프를 이미지 문법으로 바꾼다 (크기 포함)", () => {
    const result = migrate(
      [
        "::youtube[dQw4w9WgXcQ]",
        "::youtube{id=dQw4w9WgXcQ w=500 h=300}",
        "::x[https://twitter.com/jack/status/20]",
        "::soundcloud{url=https://soundcloud.com/artist/track w=600px}",
        "::instagram[https://www.instagram.com/p/Cabc_123/]",
        "::pinterest[https://www.pinterest.com/pin/123456/]",
        "::video[https://example.com/a.mp4]{w=640}",
        "::bluesky[https://bsky.app/profile/a.bsky.social/post/3kabc]",
      ].join("\n"),
    );
    expect(result.markdown).toBe(
      [
        "![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)",
        "",
        "![|500x300](https://www.youtube.com/watch?v=dQw4w9WgXcQ)",
        "",
        "![](https://x.com/jack/status/20)",
        "",
        "![|600](https://soundcloud.com/artist/track)",
        "",
        "![](https://www.instagram.com/p/Cabc_123/)",
        "",
        "![](https://www.pinterest.com/pin/123456/)",
        "",
        "![|640](https://example.com/a.mp4)",
        "",
        "![](https://bsky.app/profile/a.bsky.social/post/3kabc)",
      ].join("\n"),
    );
    expect(result.notices).toEqual([]);
  });

  it("단위가 있거나 범위 밖인 크기는 빼고 안내한다", () => {
    const result = migrate("::youtube[dQw4w9WgXcQ]{w=100% h=50}");
    expect(result.markdown).toBe("![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)");
    expect(result.notices.join("\n")).toContain("가로 크기");
    expect(result.notices.join("\n")).toContain("세로 크기");
  });

  it("바꿀 수 없는 리프는 원문을 두고 안내한다", () => {
    const result = migrate("::youtube[ab]\n::x[not a url]\n::video[https://example.com/page]\n::series{id=99}\n::post{slug=한글}");
    expect(result.markdown).toBe("::youtube[ab]\n::x[not a url]\n::video[https://example.com/page]\n::series{id=99}\n::post{slug=한글}");
    expect(result.notices).toHaveLength(5);
  });

  it("글·시리즈 임베드와 글 링크", () => {
    const result = migrate("::post{slug=Hello-World}\n\n::series{id=3}\n\n앞 :postlink[여기]{slug=old-post} 뒤 `:postlink[코드]{slug=x}` :postlink{slug=bare}");
    expect(result.markdown).toBe("![[hello-world]]\n\n![[series/my-series]]\n\n앞 [[old-post|여기]] 뒤 `:postlink[코드]{slug=x}` [[bare]]");
  });

  it("콜아웃을 인용 문법으로 바꾼다 (제목·여러 줄·중첩)", () => {
    const result = migrate(":::note\n내용\n\n둘째 문단\n:::\n\n:::danger[조심]\n위험\n:::");
    expect(result.markdown).toBe("> [!NOTE]\n> 내용\n>\n> 둘째 문단\n\n> [!danger] 조심\n> 위험");

    const nested = migrate(":::tip\n바깥\n:::warning\n안쪽\n:::\n:::");
    expect(nested.markdown).toBe("> [!TIP]\n> 바깥\n>\n> > [!WARNING]\n> > 안쪽");
  });

  it("콜아웃 안의 임베드와 코드 펜스도 옮긴다", () => {
    const result = migrate(":::info\n::youtube[dQw4w9WgXcQ]\n```js\n:::\n```\n:::");
    expect(result.markdown).toBe("> [!info]\n>\n> ![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n>\n> ```js\n> :::\n> ```");
  });

  it("정렬과 fold는 HTML 래퍼로 바꾼다", () => {
    const result = migrate(":::center\n가운데\n:::\n\n:::right\n오른쪽\n:::\n\n:::fold{h=2}\n끌어올림\n:::\n\n:::fold{h=9}\n없음\n:::");
    expect(result.markdown).toBe(
      ['<div align="center">', "", "가운데", "", "</div>", "", '<div align="right">', "", "오른쪽", "", "</div>", "", '<div data-fold="2">', "", "끌어올림", "", "</div>", "", '<div data-fold="none">', "", "없음", "", "</div>"].join("\n"),
    );
  });

  it("들여쓰기는 문단과 제목 앞의 &emsp;가 된다 (단계×2개, 임베드 줄은 제외)", () => {
    const result = migrate(":::indent{n=2}\n## 제목\n\n문단 첫 줄\n둘째 줄\n\n::youtube[dQw4w9WgXcQ]\n:::");
    const emsp = "&emsp;".repeat(4);
    expect(result.markdown).toBe(`## ${emsp}제목\n\n${emsp}문단 첫 줄\n둘째 줄\n\n![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)`);
    expect(result.notices).toEqual([]);

    const clamped = migrate(":::indent{n=99}\n문단\n:::");
    expect(clamped.markdown).toBe(`${"&emsp;".repeat(16)}문단`);
  });

  it("들여쓰기 안의 목록은 옮길 수 없어 안내한다", () => {
    const result = migrate(":::indent\n- 목록\n\n문단\n:::");
    expect(result.markdown).toBe(`- 목록\n\n${"&emsp;".repeat(2)}문단`);
    expect(result.notices.join("\n")).toContain("들여쓰기를 옮길 수 없어");
  });

  it("indent 안의 callout은 들여쓰지 않고 안내한다", () => {
    const result = migrate(":::indent\n:::note\n안쪽\n:::\n:::");
    expect(result.markdown).toBe("> [!NOTE]\n> 안쪽");
    expect(result.notices).toHaveLength(1);
  });

  it("닫히지 않은 컨테이너는 문서 끝까지 이어지고 안내한다", () => {
    const result = migrate(":::note\n끝까지");
    expect(result.markdown).toBe("> [!NOTE]\n> 끝까지");
    expect(result.notices[0]).toContain("닫히지 않은");
  });

  it("알 수 없는 컨테이너는 래퍼만 벗기고 안내한다", () => {
    const result = migrate(":::mystery\n내용\n:::");
    expect(result.markdown).toBe("내용");
    expect(result.notices[0]).toContain("mystery");
  });

  it("CRLF와 끝 줄바꿈을 보존한다", () => {
    const result = migrate(":::note\r\n내용\r\n:::\r\n");
    expect(result.markdown).toBe("> [!NOTE]\r\n> 내용\r\n");
  });

  it("직접 붙은 줄 사이에도 임베드는 자기 문단이 된다", () => {
    const result = migrate("앞 문단\n::youtube[dQw4w9WgXcQ]\n뒤 문단");
    expect(result.markdown).toBe("앞 문단\n\n![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n\n뒤 문단");
  });

  it("두 번 돌려도 같다 (멱등)", () => {
    const first = migrate(":::note[제목]\n::post{slug=a}\n:::\n\n:::indent\n문단\n:::\n\n::youtube[dQw4w9WgXcQ]{w=500}");
    expect(migrate(first.markdown).markdown).toBe(first.markdown);
  });
});
