import { describe, expect, it } from "vitest";
import { normalizeContainerFences } from "./directive-nesting";
import { renderPostHtml } from "./render";

describe("normalizeContainerFences", () => {
  it("같은 길이로 중첩된 펜스를 바깥일수록 길게 바꾼다", () => {
    const md = [":::indent{n=2}", ":::note", "안쪽", ":::", ":::"].join("\n");
    expect(normalizeContainerFences(md)).toBe(
      ["::::indent{n=2}", ":::note", "안쪽", ":::", "::::"].join("\n"),
    );
  });

  it("세 겹 중첩과 형제 컨테이너", () => {
    const md = [
      ":::center",
      ":::indent",
      ":::note",
      "a",
      ":::",
      ":::",
      ":::tip",
      "b",
      ":::",
      ":::",
    ].join("\n");
    expect(normalizeContainerFences(md)).toBe(
      [
        ":::::center",
        "::::indent",
        ":::note",
        "a",
        ":::",
        "::::",
        ":::tip",
        "b",
        ":::",
        ":::::",
      ].join("\n"),
    );
  });

  it("이미 콜론을 늘려 쓴 원문은 같은 모양으로 정규화", () => {
    const md = ["::::::indent", ":::note", ":::", "::::::"].join("\n");
    expect(normalizeContainerFences(md)).toBe(["::::indent", ":::note", ":::", "::::"].join("\n"));
  });

  it("코드 펜스·수식 블록 안의 ::: 는 건드리지 않는다", () => {
    const md = [":::note", "```", ":::", "```", "$$", ":::", "$$", ":::"].join("\n");
    expect(normalizeContainerFences(md)).toBe(md);
  });

  it("CRLF 줄바꿈도 처리", () => {
    const md = [":::indent", ":::note", ":::", ":::"].join("\r\n");
    expect(normalizeContainerFences(md)).toBe(["::::indent", ":::note", ":::", "::::"].join("\r\n"));
  });

  it("리프 디렉티브(::youtube)는 대상 아님", () => {
    const md = [":::note", "::youtube[abcdefg]", ":::"].join("\n");
    expect(normalizeContainerFences(md)).toBe(md);
  });
});

describe("중첩 컨테이너 렌더", () => {
  it("indent 안의 note가 닫는 ::: 를 흘리지 않는다", async () => {
    const html = await renderPostHtml(
      [":::indent{n=2}", ":::note", "안쪽", ":::", ":::", "", "바깥"].join("\n"),
    );
    expect(html).not.toContain(":::");
    expect(html).toMatch(/indent-block[^]*callout-note[^]*안쪽[^]*<\/div><\/div>\s*<p>바깥<\/p>/);
  });

  it("빈 note도 마찬가지", async () => {
    const html = await renderPostHtml([":::indent", ":::note", "", ":::", ":::"].join("\n"));
    expect(html).not.toContain(":::");
  });
});
