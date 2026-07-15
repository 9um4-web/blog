import { describe, expect, it } from "vitest";
import {
  resolveSlugCollision,
  SLUG_MAX_LENGTH,
  slugFromTitle,
  validateSlug,
} from "./slug";

describe("validateSlug", () => {
  it("정상 슬러그는 소문자로 정규화되어 통과한다", () => {
    expect(validateSlug("Hello-World-2", [])).toEqual({ ok: true, slug: "hello-world-2" });
  });

  it("빈 문자열/공백은 거부", () => {
    expect(validateSlug("  ", [])).toEqual({ ok: false, reason: "empty" });
  });

  it("100자 초과 거부 (스펙 9.1)", () => {
    expect(validateSlug("a".repeat(SLUG_MAX_LENGTH + 1), [])).toEqual({
      ok: false,
      reason: "too-long",
    });
    expect(validateSlug("a".repeat(SLUG_MAX_LENGTH), []).ok).toBe(true);
  });

  it("영문/숫자/하이픈 외 문자 거부", () => {
    expect(validateSlug("한글슬러그", []).ok).toBe(false);
    expect(validateSlug("with space", []).ok).toBe(false);
    expect(validateSlug("under_score", []).ok).toBe(false);
  });

  it("시스템 예약어 거부", () => {
    expect(validateSlug("admin", [])).toEqual({ ok: false, reason: "reserved" });
    expect(validateSlug("api", [])).toEqual({ ok: false, reason: "reserved" });
  });

  it("SpecialPage.key 동적 예약어 거부 (스펙 8장)", () => {
    expect(validateSlug("about", ["main", "about"])).toEqual({
      ok: false,
      reason: "reserved",
    });
    expect(validateSlug("about", []).ok).toBe(true);
  });
});

describe("slugFromTitle", () => {
  it("영문 제목을 슬러그로 변환", () => {
    expect(slugFromTitle("Hello World! Part 2")).toBe("hello-world-part-2");
  });

  it("허용 문자가 하나도 없으면 untitled로 fallback", () => {
    expect(slugFromTitle("한글 제목")).toBe("untitled");
  });

  it("연속 하이픈/양끝 하이픈 정리", () => {
    expect(slugFromTitle("--a  --  b--")).toBe("a-b");
  });
});

describe("resolveSlugCollision", () => {
  it("충돌 없으면 그대로", () => {
    expect(resolveSlugCollision("post", new Set())).toBe("post");
  });

  it("충돌 시 -1, -2 suffix (스펙 2장)", () => {
    expect(resolveSlugCollision("post", new Set(["post"]))).toBe("post-1");
    expect(resolveSlugCollision("post", new Set(["post", "post-1"]))).toBe("post-2");
  });

  it("suffix를 붙여도 100자를 넘지 않는다", () => {
    const base = "a".repeat(SLUG_MAX_LENGTH);
    const result = resolveSlugCollision(base, new Set([base]));
    expect(result.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(result.endsWith("-1")).toBe(true);
  });
});
