import { describe, expect, it } from "vitest";
import { getBookmarkExportGuideForUserAgent } from "@favlock/shared";

describe("bookmark export browser detection", () => {
  it.each([
    ["Chrome", "Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36"],
    ["Edge", "Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0"],
    ["Firefox", "Mozilla/5.0 Firefox/128.0"],
    ["Safari", "Mozilla/5.0 Version/17.5 Safari/605.1.15"],
    ["Chrome", "Mozilla/5.0 CriOS/126.0.0.0 Mobile/15E148 Safari/604.1"],
    ["Edge", "Mozilla/5.0 EdgiOS/126.0 Mobile/15E148 Safari/605.1.15"],
    ["Firefox", "Mozilla/5.0 FxiOS/128.0 Mobile/15E148 Safari/605.1.15"],
  ])("detects %s", (label, userAgent) => {
    expect(getBookmarkExportGuideForUserAgent(userAgent)?.label).toBe(label);
  });

  it("returns no guide for an unknown browser", () => {
    expect(getBookmarkExportGuideForUserAgent("FavLockBot/1.0")).toBeNull();
  });
});
