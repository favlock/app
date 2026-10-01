import { describe, expect, it } from "vitest";
import { getFirefoxExtensionOrigin, parseFirefoxBookmarksTree } from "./firefoxBookmarkImport";

describe("Firefox bookmark import", () => {
  it("accepts only a Firefox installation UUID origin", () => {
    const origin = "moz-extension://11111111-1111-4111-8111-111111111111";
    expect(getFirefoxExtensionOrigin(`?firefoxExtensionOrigin=${encodeURIComponent(origin)}`)).toBe(origin);
    for (const value of ["https://evil.example", "moz-extension://firefox@favlock.app", `${origin}/evil`, `${origin}?x=1`]) {
      expect(getFirefoxExtensionOrigin(`?firefoxExtensionOrigin=${encodeURIComponent(value)}`)).toBeNull();
    }
  });
  it("preserves nested folders and ignores Firefox separators", () => {
    const result = parseFirefoxBookmarksTree([{ title: "", children: [{ type: "folder", title: "Toolbar", children: [{ type: "separator", title: "divider" }, { title: "Article", url: "https://example.com" }] }] }]);
    expect(result).toEqual({ bookmarks: [{ title: "Article", url: "https://example.com", folderPath: ["Toolbar"] }], folderPaths: [["Toolbar"]] });
  });
  it("bounds imports and tolerates malformed records", () => {
    expect(parseFirefoxBookmarksTree([null, false, "text"])).toEqual({ bookmarks: [], folderPaths: [] });
    expect(() => parseFirefoxBookmarksTree(Array(100_001).fill(null))).toThrow("too many");
  });
});
