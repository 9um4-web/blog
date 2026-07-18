import { describe, expect, it } from "vitest";
import {
  BUILTIN_NAV_ITEMS,
  mergeNavItems,
  moveNavItem,
  seriesNavId,
  serializeNavItems,
  toggleNavItem,
  type NavItem,
} from "./nav-items";

const SERIES = [
  { id: 1, slug: "devlog", name: "개발일지" },
  { id: 2, slug: "life", name: "일상" },
];

describe("mergeNavItems", () => {
  it("저장된 목록이 비어 있으면 builtin 전체(on) + 시리즈 전체(off)를 순서대로 만든다", () => {
    const result = mergeNavItems([], SERIES);
    expect(result.map((i) => i.id)).toEqual([
      "builtin:posts",
      "builtin:tags",
      "builtin:series",
      "builtin:guestbook",
      "series:1",
      "series:2",
    ]);
    expect(result.slice(0, 4).every((i) => i.enabled)).toBe(true);
    expect(result.slice(4).every((i) => !i.enabled)).toBe(true);
  });

  it("저장된 순서/on-off를 그대로 반영한다", () => {
    const result = mergeNavItems(
      [
        { id: "series:1", enabled: true },
        { id: "builtin:posts", enabled: false },
      ],
      SERIES,
    );
    expect(result[0]).toMatchObject({ id: "series:1", label: "개발일지", enabled: true });
    expect(result[1]).toMatchObject({ id: "builtin:posts", enabled: false });
  });

  it("삭제된 시리즈를 가리키는 저장 항목은 조용히 빠진다", () => {
    const result = mergeNavItems([{ id: "series:999", enabled: true }], SERIES);
    expect(result.some((i) => i.id === "series:999")).toBe(false);
  });

  it("저장 목록에 없는 신규 시리즈는 끝에 off로 자동 추가된다", () => {
    const result = mergeNavItems(
      BUILTIN_NAV_ITEMS.map((b) => ({ id: b.id, enabled: true })),
      SERIES,
    );
    const tail = result.slice(4);
    expect(tail.map((i) => i.id)).toEqual(["series:1", "series:2"]);
    expect(tail.every((i) => !i.enabled)).toBe(true);
  });

  it("중복 저장 항목은 한 번만 반영된다", () => {
    const result = mergeNavItems(
      [
        { id: "builtin:posts", enabled: false },
        { id: "builtin:posts", enabled: true },
      ],
      [],
    );
    expect(result.filter((i) => i.id === "builtin:posts")).toHaveLength(1);
    expect(result.find((i) => i.id === "builtin:posts")?.enabled).toBe(false);
  });
});

describe("toggleNavItem / moveNavItem", () => {
  const base: NavItem[] = [
    { id: "a", label: "A", href: "/a", enabled: true },
    { id: "b", label: "B", href: "/b", enabled: false },
    { id: "c", label: "C", href: "/c", enabled: true },
  ];

  it("toggleNavItem은 해당 id의 enabled만 바꾼다", () => {
    const result = toggleNavItem(base, "b", true);
    expect(result.find((i) => i.id === "b")?.enabled).toBe(true);
    expect(result.find((i) => i.id === "a")?.enabled).toBe(true);
    expect(base.find((i) => i.id === "b")?.enabled).toBe(false); // 원본 불변
  });

  it("moveNavItem은 인접 항목과 순서를 바꾼다 (enabled 무관)", () => {
    const result = moveNavItem(base, "b", "up");
    expect(result.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("맨 끝에서 더 이동하려 하면 원본을 그대로 반환한다", () => {
    expect(moveNavItem(base, "a", "up")).toBe(base);
    expect(moveNavItem(base, "c", "down")).toBe(base);
  });

  it("존재하지 않는 id는 원본을 그대로 반환한다", () => {
    expect(moveNavItem(base, "z", "up")).toBe(base);
  });
});

describe("seriesNavId / serializeNavItems", () => {
  it("seriesNavId는 series:<id> 형식을 만든다", () => {
    expect(seriesNavId(7)).toBe("series:7");
  });

  it("serializeNavItems는 id/enabled만 남긴다", () => {
    const items: NavItem[] = [{ id: "x", label: "X", href: "/x", enabled: true }];
    expect(serializeNavItems(items)).toEqual([{ id: "x", enabled: true }]);
  });
});
