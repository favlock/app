import { describe, expect, it } from "vitest";
import {
  parseSidebarItemLimit,
  sidebarItemLimitCount,
} from "./sidebarItemLimit";

describe("parseSidebarItemLimit", () => {
  it("accepts the offered options", () => {
    expect(parseSidebarItemLimit("10")).toBe(10);
    expect(parseSidebarItemLimit("20")).toBe(20);
    expect(parseSidebarItemLimit("all")).toBe("all");
  });

  it("falls back to five for missing or unknown values", () => {
    expect(parseSidebarItemLimit(null)).toBe(5);
    expect(parseSidebarItemLimit("7")).toBe(5);
    expect(parseSidebarItemLimit("")).toBe(5);
  });
});

describe("sidebarItemLimitCount", () => {
  it("shows every item for the all option", () => {
    expect(sidebarItemLimitCount("all")).toBe(Number.POSITIVE_INFINITY);
    expect(sidebarItemLimitCount(10)).toBe(10);
  });
});
