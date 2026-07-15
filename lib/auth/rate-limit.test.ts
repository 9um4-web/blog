import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLoginFailures,
  lockedForSeconds,
  recordLoginFailure,
} from "./rate-limit";

describe("login rate limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearLoginFailures("ip1");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("5회 미만 실패는 잠기지 않는다", () => {
    for (let i = 0; i < 4; i++) recordLoginFailure("ip1");
    expect(lockedForSeconds("ip1")).toBeNull();
  });

  it("5회 실패 시 잠긴다", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("ip1");
    expect(lockedForSeconds("ip1")).toBeGreaterThan(0);
  });

  it("윈도우(15분) 경과 후 자동 해제된다", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("ip1");
    vi.advanceTimersByTime(15 * 60 * 1000 + 1000);
    expect(lockedForSeconds("ip1")).toBeNull();
  });

  it("성공 시 실패 카운트가 초기화된다", () => {
    for (let i = 0; i < 4; i++) recordLoginFailure("ip1");
    clearLoginFailures("ip1");
    recordLoginFailure("ip1");
    expect(lockedForSeconds("ip1")).toBeNull();
  });

  it("키(IP)별로 독립 카운트", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("ip1");
    expect(lockedForSeconds("ip2")).toBeNull();
  });
});
