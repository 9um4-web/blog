import { describe, expect, it } from "vitest";
import {
  canDeleteTag,
  closureRowsForNewTag,
  closureRowsForReparent,
  wouldCreateCycle,
} from "./tag-closure";

describe("closureRowsForNewTag", () => {
  it("루트 태그는 self 행만 생성", () => {
    expect(closureRowsForNewTag(10, [])).toEqual([
      { ancestorId: 10, descendantId: 10, depth: 0 },
    ]);
  });

  it("부모의 조상 체인에 depth+1로 연결", () => {
    // 부모 5의 조상 체인: 5(self, 0), 1(depth 1)
    const rows = closureRowsForNewTag(10, [
      { ancestorId: 5, depth: 0 },
      { ancestorId: 1, depth: 1 },
    ]);
    expect(rows).toContainEqual({ ancestorId: 10, descendantId: 10, depth: 0 });
    expect(rows).toContainEqual({ ancestorId: 5, descendantId: 10, depth: 1 });
    expect(rows).toContainEqual({ ancestorId: 1, descendantId: 10, depth: 2 });
  });
});

describe("wouldCreateCycle", () => {
  it("루트로 이동(parent=null)은 항상 허용", () => {
    expect(wouldCreateCycle(1, null, new Set([2, 3]))).toBe(false);
  });

  it("자기 자신을 부모로 지정하면 순환", () => {
    expect(wouldCreateCycle(1, 1, new Set())).toBe(true);
  });

  it("자신의 자손을 부모로 지정하면 순환 (스펙 5장)", () => {
    expect(wouldCreateCycle(1, 3, new Set([2, 3]))).toBe(true);
  });

  it("무관한 태그로는 이동 가능", () => {
    expect(wouldCreateCycle(1, 9, new Set([2, 3]))).toBe(false);
  });
});

describe("canDeleteTag", () => {
  it("depth=1 자식이 있으면 삭제 금지 (스펙 5장)", () => {
    expect(canDeleteTag(1)).toBe(false);
    expect(canDeleteTag(0)).toBe(true);
  });
});

describe("closureRowsForReparent", () => {
  it("새 부모 조상 체인 × 서브트리 조합으로 행 생성", () => {
    // 태그 10(자식 11)을 새 부모 20(조상 체인: 20 self, 2 depth1) 아래로 이동
    const rows = closureRowsForReparent(
      [
        { ancestorId: 20, depth: 0 },
        { ancestorId: 2, depth: 1 },
      ],
      [
        { descendantId: 10, depth: 0 },
        { descendantId: 11, depth: 1 },
      ],
    );
    expect(rows).toContainEqual({ ancestorId: 20, descendantId: 10, depth: 1 });
    expect(rows).toContainEqual({ ancestorId: 20, descendantId: 11, depth: 2 });
    expect(rows).toContainEqual({ ancestorId: 2, descendantId: 10, depth: 2 });
    expect(rows).toContainEqual({ ancestorId: 2, descendantId: 11, depth: 3 });
    expect(rows).toHaveLength(4);
  });
});
