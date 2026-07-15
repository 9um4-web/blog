import { describe, expect, it } from "vitest";
import { keyAfter, keyBefore, keyBetween } from "./ordering";

describe("ordering (fractional keys)", () => {
  it("빈 목록의 첫 키를 만든다", () => {
    const k = keyAfter(null);
    expect(typeof k).toBe("string");
    expect(k.length).toBeGreaterThan(0);
  });

  it("뒤에 붙는 키는 항상 더 크다", () => {
    const a = keyAfter(null);
    const b = keyAfter(a);
    expect(b > a).toBe(true);
  });

  it("앞에 붙는 키는 항상 더 작다", () => {
    const a = keyAfter(null);
    const front = keyBefore(a);
    expect(front < a).toBe(true);
  });

  it("사이 삽입 키는 두 키 사이에 정렬된다 (스펙 6장 중간 삽입)", () => {
    const a = keyAfter(null);
    const b = keyAfter(a);
    const mid = keyBetween(a, b);
    expect(mid > a && mid < b).toBe(true);
  });

  it("반복 삽입해도 정렬 순서가 유지된다", () => {
    let low = keyAfter(null);
    let high = keyAfter(low);
    for (let i = 0; i < 50; i++) {
      const mid = keyBetween(low, high);
      expect(mid > low && mid < high).toBe(true);
      if (i % 2 === 0) low = mid;
      else high = mid;
    }
  });
});
