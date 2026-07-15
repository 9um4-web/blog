import { describe, expect, it } from "vitest";
import { extractHeadingTree, parseForSave, parseMarkdown } from "./markdown";

function tree(md: string) {
  return extractHeadingTree(parseMarkdown(md));
}

describe("extractHeadingTree", () => {
  it("h2부터 시작하는 기본 트리를 만든다", () => {
    const t = tree(["## A", "### A-1", "### A-2", "## B"].join("\n\n"));
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ text: "A", level: 2 });
    expect(t[0].children.map((c) => c.text)).toEqual(["A-1", "A-2"]);
    expect(t[1]).toMatchObject({ text: "B", level: 2, children: [] });
  });

  it("h1은 무시한다 (스펙 3.3)", () => {
    const t = tree(["# 제목", "## 본문 시작"].join("\n\n"));
    expect(t).toHaveLength(1);
    expect(t[0].text).toBe("본문 시작");
  });

  it("레벨 스킵 시 level 값은 보존하고 부모는 직전의 더 낮은 level 헤딩 (스펙 3.4)", () => {
    const t = tree(["## A", "#### D", "### C"].join("\n\n"));
    // h2 A 아래에 h4 D와 h3 C가 형제로 붙는다 (D의 부모도 A, C의 부모도 A)
    expect(t).toHaveLength(1);
    expect(t[0].children.map((c) => [c.text, c.level])).toEqual([
      ["D", 4],
      ["C", 3],
    ]);
  });

  it("h5 다음 h3이 오면 스택이 올바르게 감긴다", () => {
    const t = tree(["## A", "### B", "##### E", "### C"].join("\n\n"));
    expect(t[0].children.map((c) => c.text)).toEqual(["B", "C"]);
    expect(t[0].children[0].children.map((c) => c.text)).toEqual(["E"]);
  });

  it("동일 텍스트 헤딩은 -1, -2로 dedup된다 (스펙 3.5)", () => {
    const t = tree(["## 개요", "## 개요", "## 개요"].join("\n\n"));
    expect(t.map((n) => n.id)).toEqual(["개요", "개요-1", "개요-2"]);
  });

  it("코드블록/mermaid 내부의 #은 헤딩으로 취급하지 않는다 (스펙 1장/4.2)", () => {
    const md = [
      "## 실제 헤딩",
      "```mermaid",
      "graph TD",
      "  A --> B",
      "## 이건 헤딩 아님",
      "```",
      "```bash",
      "# 주석도 헤딩 아님",
      "```",
    ].join("\n");
    const t = tree(md);
    expect(t).toHaveLength(1);
    expect(t[0].text).toBe("실제 헤딩");
  });

  it("인라인 마크업이 있는 헤딩은 텍스트만 추출한다", () => {
    const t = tree("## **굵은** `코드` 제목");
    expect(t[0].text).toBe("굵은 코드 제목");
  });

  it("문서 최상위가 아닌(인용문 내부) 헤딩은 제외한다", () => {
    const t = tree(["## A", "> ## 인용 속 헤딩"].join("\n\n"));
    expect(t).toHaveLength(1);
    expect(t[0].text).toBe("A");
  });

  it("빈 문서는 빈 forest", () => {
    expect(tree("")).toEqual([]);
  });
});

describe("parseForSave", () => {
  it("정상 문서는 ok=true와 heading_tree를 돌려준다", () => {
    const r = parseForSave("## A");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.headingTree[0].text).toBe("A");
  });
});
