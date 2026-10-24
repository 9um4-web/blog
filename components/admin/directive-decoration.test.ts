import { describe, expect, it } from "vitest";
import { decorationFor } from "./directive-decoration";

describe("decorationFor", () => {
  it("indent는 n단계(1~8)를 1.5rem 단위 왼쪽 여백으로", () => {
    expect(decorationFor(":::indent{n=2}")?.style).toBe("margin-left: 3rem");
    expect(decorationFor(":::indent{n=99}")?.style).toBe("margin-left: 12rem");
    expect(decorationFor(":::indent{n=0}")?.style).toBe("margin-left: 1.5rem");
    expect(decorationFor(":::indent")?.style).toBe("margin-left: 1.5rem");
  });

  it("콜론이 더 많은 여는 줄도 읽는다", () => {
    expect(decorationFor("::::indent{n=3}")?.style).toBe("margin-left: 4.5rem");
  });

  it("fold는 h=2~6만 소속 표시, 그 밖은 none", () => {
    expect(decorationFor(":::fold{h=3}")?.["data-fold"]).toBe("3");
    expect(decorationFor(":::fold{h=none}")?.["data-fold"]).toBe("none");
    expect(decorationFor(":::fold{h=9}")?.["data-fold"]).toBe("none");
  });

  it("다른 디렉티브는 꾸미지 않는다", () => {
    expect(decorationFor(":::note[제목]")).toBeNull();
    expect(decorationFor(":::indentation")).toBeNull();
  });
});
