import { describe, expect, it } from "vitest";
import {
  formatResourceLimit,
  getRemainingResourceLimit,
  hasReachedResourceLimit,
  PLANS,
} from "./resourceLimits";

describe("resource limits", () => {
  it("defines the approved bookmark allowances without changing other limits", () => {
    expect(PLANS.free.limits).toEqual({
      bookmarks: 1_000,
      entries: 50,
      readspace: 25,
      collections: 0,
      tags: 0,
      lists: 3,
    });
    expect(PLANS.pro.limits).toEqual({
      bookmarks: 0,
      entries: 1_000,
      readspace: 250,
      collections: 0,
      tags: 0,
      lists: 0,
    });
  });

  it("formats and enforces finite and unlimited allowances consistently", () => {
    expect(formatResourceLimit(1_000)).toBe("1,000");
    expect(formatResourceLimit(0)).toBe("Unlimited");
    expect(hasReachedResourceLimit(1_000, 1_000)).toBe(true);
    expect(hasReachedResourceLimit(100_000, 0)).toBe(false);
    expect(getRemainingResourceLimit(750, 1_000)).toBe(250);
    expect(getRemainingResourceLimit(100_000, 0)).toBeNull();
  });
});
