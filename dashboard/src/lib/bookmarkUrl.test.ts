import { describe, expect, it } from "vitest";
import { normalizeBookmarkUrlForLinkCheck } from "./bookmarkUrl";

describe("normalizeBookmarkUrlForLinkCheck", () => {
  it("removes page fragments and known tracking parameters", () => {
    expect(
      normalizeBookmarkUrlForLinkCheck(
        "https://example.com/article?id=42&utm_source=email#comments",
      ),
    ).toBe("https://example.com/article?id=42");
  });

  it("keeps non-tracking query parameters because they can change availability", () => {
    expect(
      normalizeBookmarkUrlForLinkCheck("https://example.com/download?id=one"),
    ).not.toBe(
      normalizeBookmarkUrlForLinkCheck("https://example.com/download?id=two"),
    );
  });
});
