import { describe, expect, it } from "vitest";
import {
  buildSearchText,
  scoreBookmarkMatch,
  searchStoredBookmarks,
  type StoredBookmark,
} from "./bookmarkCache";

const bookmark: StoredBookmark = {
  id: "bookmark-1",
  user_id: "user-1",
  title: "React Query Guide",
  url: "https://tanstack.com/query/latest",
  created_at: "2026-01-01T00:00:00.000Z",
  folders: [
    {
      id: "folder-1",
      user_id: "user-1",
      name: "Frontend",
      color: null,
      parent_id: null,
      sort_order: 0,
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ],
  tags: [
    {
      id: "tag-1",
      user_id: "user-1",
      name: "react",
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ],
  __searchText: "",
};

bookmark.__searchText = buildSearchText(bookmark);

describe("bookmark search helpers", () => {
  it("builds search text from title, URL, tags, and folders", () => {
    expect(bookmark.__searchText).toContain("react query guide");
    expect(bookmark.__searchText).toContain("tanstack.com");
    expect(bookmark.__searchText).toContain("frontend");
    expect(bookmark.__searchText).toContain("react");
  });

  it("scores title matches above URL-only matches", () => {
    const titleScore = scoreBookmarkMatch(bookmark, ["react"]);
    const urlScore = scoreBookmarkMatch(
      { ...bookmark, title: "Docs", __searchText: "docs tanstack" },
      ["tanstack"],
    );

    expect(titleScore).toBeGreaterThan(urlScore);
  });

  it("returns a bounded ranked page while preserving the total match count", () => {
    const stored = [
      { ...bookmark, id: "includes", title: "A guide to React" },
      { ...bookmark, id: "exact", title: "React" },
      { ...bookmark, id: "starts", title: "React patterns" },
      {
        ...bookmark,
        id: "url-only",
        title: "Frontend guide",
        url: "https://example.com/react",
      },
    ].map((item) => ({ ...item, __searchText: buildSearchText(item) }));

    const firstPage = searchStoredBookmarks(stored, "react", {
      limit: 2,
    });
    const secondPage = searchStoredBookmarks(stored, "react", {
      offset: 2,
      limit: 2,
    });

    expect(firstPage.total).toBe(4);
    expect(firstPage.bookmarks.map((item) => item.id)).toEqual([
      "exact",
      "starts",
    ]);
    expect(secondPage.bookmarks.map((item) => item.id)).toEqual([
      "includes",
      "url-only",
    ]);
    expect(firstPage.bookmarks[0]).not.toHaveProperty("__searchText");
  });

  it("uses recency to order otherwise equal matches", () => {
    const stored = [
      {
        ...bookmark,
        id: "older",
        title: "React guide",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        ...bookmark,
        id: "newer",
        title: "React handbook",
        created_at: "2026-02-01T00:00:00.000Z",
      },
    ].map((item) => ({ ...item, __searchText: buildSearchText(item) }));

    expect(
      searchStoredBookmarks(stored, "react").bookmarks.map(
        (item) => item.id,
      ),
    ).toEqual(["newer", "older"]);
  });
});
