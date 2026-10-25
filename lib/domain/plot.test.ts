import { describe, expect, it } from "vitest";

import { renderPostHtml } from "./render";

const html = (md: string) => renderPostHtml(md);

describe("수식 그래프(plot) 코드 블록", () => {
  it("2D 식은 SVG 그림(figure.plot)으로", async () => {
    const out = await html("```plot\ntitle: 사인\ny = sin(x)\n```");
    expect(out).toContain('<figure class="plot"><svg ');
    expect(out).toContain(">사인</text>");
    expect(out).not.toContain("<pre");
    expect(out).not.toContain("language-plot");
  });

  it("3D 곡면은 정지 그림으로", async () => {
    const out = await html("```plot\nz = x^2 - y^2\n```");
    expect(out).toContain("<polygon");
    expect(out).toContain("x: -5 … 5");
  });

  it("식이 틀리면 일반 코드 블록으로 남는다", async () => {
    const out = await html("```plot\ny = foo(x)\n```");
    expect(out).toContain("<pre");
    expect(out).toContain("y = foo(x)");
    expect(out).not.toContain("<svg");
  });

  it("다른 언어의 코드 블록과 섞여도 영향이 없다", async () => {
    const out = await html("```ts\nconst a = 1;\n```\n\n```plot\ny = x\n```\n\n```mermaid\ngraph TD;A-->B\n```");
    expect(out).toContain("shiki");
    expect(out).toContain('<figure class="plot">');
    expect(out).toContain("mermaid");
  });

  it("제목 속 HTML은 이스케이프되고 스크립트가 새지 않는다", async () => {
    const out = await html('```plot\ntitle: <script>alert(1)</script><img src=x onerror=alert(2)>\ny = x  # <b>굵게</b>\n```');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<b>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("allowDangerousHtml을 켰어도 마크다운 속 원문 HTML은 여전히 버려진다", async () => {
    const out = await html('앞\n\n<script>alert(1)</script>\n\n<div onclick="x()">내용</div>\n\n<img src=x onerror=alert(2)>\n\n뒤');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onerror");
    expect(out).toContain("앞");
    expect(out).toContain("뒤");
  });

  it("코드 블록 메타·줄 번호 같은 다른 코드 기능과 함께 쓸 수 있다", async () => {
    const out = await html('```ts title="a.ts" {1}\nconst a = 1;\n```\n\n```plot\ny = x\n```');
    expect(out).toContain("code-title");
    expect(out).toContain("plot");
  });
});
