import { describe, expect, it } from "vitest";
import {
  countDuplicateBookmarks,
  filterBookmarkDuplicateGroups,
  findBookmarkDuplicateGroups,
  findBookmarkDuplicateGroupsInBatches,
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
    expect(groups[0].matchNote).toBe("Same normalized URL.");
    expect(countDuplicateBookmarks(groups)).toBe(1);
  });

  it("does not group distinct protocols, paths, or meaningful queries", () => {
    const groups = findBookmarkDuplicateGroups([
      bookmark("1", "http://example.com", "2026-01-01T00:00:00.000Z"),
      bookmark("2", "https://example.com", "2026-01-01T00:00:00.000Z"),
      bookmark("3", "https://example.com/path", "2026-01-01T00:00:00.000Z"),
      bookmark("4", "https://example.com/?q=1", "2026-01-01T00:00:00.000Z"),
    ]);

    expect(groups).toEqual([]);
  });

  it("groups path URLs with or without a trailing slash", () => {
    const groups = findBookmarkDuplicateGroups([
      bookmark(
        "with-slash",
        "https://jakearchibald.github.io/svgomg/",
        "2026-01-01T00:00:00.000Z",
      ),
      bookmark(
        "without-slash",
        "https://jakearchibald.github.io/svgomg",
        "2026-02-01T00:00:00.000Z",
      ),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].normalizedUrl).toBe(
      "https://jakearchibald.github.io/svgomg",
    );
    expect(groups[0].keeper.id).toBe("with-slash");
    expect(groups[0].duplicates.map(({ id }) => id)).toEqual([
      "without-slash",
    ]);
  });

  it("silently ignores tracking parameters and fragments by default", () => {
    const groups = findBookmarkDuplicateGroups([
      bookmark("1", "https://example.com/article", "2026-01-01T00:00:00.000Z"),
      bookmark(
        "2",
        "https://example.com/article?utm_source=newsletter&fbclid=abc#comments",
        "2026-02-01T00:00:00.000Z",
      ),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].normalizedUrl).toBe("https://example.com/article");
    expect(groups[0].matchNote).toBe(
      "Matched after ignoring tracking parameters (fbclid, utm_source) and page sections.",
    );
  });

  it("can ignore every query parameter without collapsing distinct paths", () => {
    const groups = findBookmarkDuplicateGroups(
      [
        bookmark("1", "https://example.com/article?id=1", "2026-01-01T00:00:00.000Z"),
        bookmark("2", "https://example.com/article?id=2", "2026-02-01T00:00:00.000Z"),
        bookmark("3", "https://example.com/other?id=1", "2026-02-01T00:00:00.000Z"),
      ],
      "query",
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].normalizedUrl).toBe("https://example.com/article");
    expect(groups[0].matchNote).toBe(
      "Matched after ignoring query parameters.",
    );
  });

  it("preserves fragments and tracking parameters in exact mode", () => {
    const groups = findBookmarkDuplicateGroups(
      [
        bookmark("1", "https://example.com/article", "2026-01-01T00:00:00.000Z"),
        bookmark("2", "https://example.com/article#details", "2026-02-01T00:00:00.000Z"),
        bookmark("3", "https://example.com/article?utm_source=email", "2026-02-01T00:00:00.000Z"),
      ],
      "exact",
    );

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

  it("reports incremental progress while scanning large libraries", async () => {
    const progress: [number, number][] = [];
    const groups = await findBookmarkDuplicateGroupsInBatches(
      [
        bookmark("1", "https://example.com", "2026-01-01T00:00:00.000Z"),
        bookmark("2", "https://example.com?utm_source=email", "2026-02-01T00:00:00.000Z"),
        bookmark("3", "https://example.org", "2026-02-01T00:00:00.000Z"),
      ],
      "tracking",
      (scanned, total) => progress.push([scanned, total]),
      undefined,
      1,
    );

    expect(progress).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(groups).toHaveLength(1);
  });

  it("filters duplicate groups across titles, URLs, and match notes", () => {
    const groups = findBookmarkDuplicateGroups([
      {
        ...bookmark("article-old", "https://example.com/article", "2026-01-01T00:00:00.000Z"),
        title: "Design systems",
      },
      bookmark(
        "article-new",
        "https://example.com/article?utm_source=newsletter",
        "2026-02-01T00:00:00.000Z",
      ),
      {
        ...bookmark("docs-old", "https://docs.example.org/guide", "2026-01-01T00:00:00.000Z"),
        title: "API guide",
      },
      bookmark("docs-new", "https://docs.example.org/guide#setup", "2026-02-01T00:00:00.000Z"),
    ]);

    expect(
      filterBookmarkDuplicateGroups(groups, "design newsletter").map(
        (group) => group.keeper.id,
      ),
    ).toEqual(["article-old"]);
    expect(
      filterBookmarkDuplicateGroups(groups, "docs.example.org").map(
        (group) => group.keeper.id,
      ),
    ).toEqual(["docs-old"]);
    expect(
      filterBookmarkDuplicateGroups(groups, "page sections").map(
        (group) => group.keeper.id,
      ),
    ).toEqual(["docs-old"]);
    expect(filterBookmarkDuplicateGroups(groups, "missing")).toEqual([]);
    expect(filterBookmarkDuplicateGroups(groups, "   ")).toBe(groups);
  });
});
