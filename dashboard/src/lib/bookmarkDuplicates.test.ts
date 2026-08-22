import { describe, expect, it } from "vitest";
import {
  countDuplicateBookmarks,
  findBookmarkDuplicateGroups,
  type DuplicateBookmarkCandidate,
} from "./bookmarkDuplicates";

const bookmark = (
  id: string,
  url: string,
  createdAt: string,
): DuplicateBookmarkCandidate => ({
  id,
  title: `Bookmark ${id}`,
  url,
  created_at: createdAt,
});

describe("findBookmarkDuplicateGroups", () => {
  it("groups normalized URLs and keeps the oldest bookmark", () => {
    const groups = findBookmarkDuplicateGroups([
      bookmark("new", "https://example.com", "2026-02-01T00:00:00.000Z"),
      bookmark("old", "  example.com  ", "2026-01-01T00:00:00.000Z"),
      bookmark("other", "https://example.org/path", "2026-01-01T00:00:00.000Z"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].normalizedUrl).toBe("https://example.com/");
    expect(groups[0].keeper.id).toBe("old");
    expect(groups[0].duplicates.map(({ id }) => id)).toEqual(["new"]);
    expect(countDuplicateBookmarks(groups)).toBe(1);
  });

  it("does not group distinct protocols, paths, queries, or fragments", () => {
    const groups = findBookmarkDuplicateGroups([
      bookmark("1", "http://example.com", "2026-01-01T00:00:00.000Z"),
      bookmark("2", "https://example.com", "2026-01-01T00:00:00.000Z"),
      bookmark("3", "https://example.com/path", "2026-01-01T00:00:00.000Z"),
      bookmark("4", "https://example.com/?q=1", "2026-01-01T00:00:00.000Z"),
      bookmark("5", "https://example.com/#section", "2026-01-01T00:00:00.000Z"),
    ]);

    expect(groups).toEqual([]);
  });

  it("ignores invalid URLs and uses the id as a stable tie breaker", () => {
    const groups = findBookmarkDuplicateGroups([
      bookmark("b", "https://example.com", "2026-01-01T00:00:00.000Z"),
      bookmark("a", "https://example.com/", "2026-01-01T00:00:00.000Z"),
      bookmark("invalid", "not a valid URL", "2025-01-01T00:00:00.000Z"),
    ]);

    expect(groups[0].keeper.id).toBe("a");
    expect(groups[0].duplicates[0].id).toBe("b");
  });
});
