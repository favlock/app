import { describe, expect, it } from "vitest";
import {
  normalizeBookmarkUrlForLinkCheck,
  normalizeImportedBookmarkUrl,
} from "./bookmarkUrl";

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

describe("normalizeImportedBookmarkUrl", () => {
  it.each([
    ["https://example.com/a", "https://example.com/a"],
    ["HTTP://Example.com", "http://example.com/"],
    ["example.com/path?q=1", "https://example.com/path?q=1"],
    ["example.com:8080/path", "https://example.com:8080/path"],
    ["localhost:3000", "https://localhost:3000/"],
    ["docs.example.com/a:b", "https://docs.example.com/a:b"],
  ])("accepts web addresses: %s", (input, expected) => {
    expect(normalizeImportedBookmarkUrl(input)).toBe(expected);
  });

  it.each([
    "ftp://files.example.com/archive.zip",
    "mailto:someone@example.com",
    "file:///etc/hosts",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "chrome://settings",
    "about:blank",
    "",
    "   ",
  ])("rejects non-web URLs instead of rewriting them: %s", (input) => {
    expect(normalizeImportedBookmarkUrl(input)).toBeNull();
  });
});
