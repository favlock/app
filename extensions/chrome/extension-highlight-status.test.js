import { describe, expect, it } from "vitest";
import { getUnmatchedHighlightNotice } from "./extension-highlight-status.js";

describe("web highlight restoration status", () => {
  it("explains that one unmatched highlight remains available", () => {
    expect(getUnmatchedHighlightNotice({ matched: 1, total: 2 })).toBe(
      "FavLock couldn’t place 1 saved highlight. The page may have changed. It remains available in Readspace.",
    );
  });

  it("reports multiple unmatched highlights and ignores complete or invalid results", () => {
    expect(getUnmatchedHighlightNotice({ matched: 1, total: 3 })).toBe(
      "FavLock couldn’t place 2 saved highlights. The page may have changed. They remain available in Readspace.",
    );
    expect(getUnmatchedHighlightNotice({ matched: 2, total: 2 })).toBeNull();
    expect(getUnmatchedHighlightNotice({ matched: 3, total: 2 })).toBeNull();
    expect(getUnmatchedHighlightNotice(null)).toBeNull();
  });
});
