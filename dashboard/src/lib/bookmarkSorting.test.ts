import { describe, expect, it } from "vitest";
import { sortBookmarks, sortLibraryItems, type BookmarkSortOrder } from "./bookmarkSorting";
import { buildSearchText, searchStoredBookmarks } from "./bookmarkCache";
import { mergeHomeLibraryItems } from "./homeLibrary";
import type { Bookmark, Note } from "../types/bookmark";

const bookmarks: Bookmark[] = [
  { id: "a", user_id: "test", title: "Article 10", url: "https://www.zebra.test/path", created_at: "2026-01-01T00:00:00Z", is_favorite: true, favorited_at: "2026-03-01T00:00:00Z" },
  { id: "b", user_id: "test", title: "article 2", url: "https://alpha.test", created_at: "2026-02-01T00:00:00Z", is_favorite: true, favorited_at: "2026-02-01T00:00:00Z" },
  { id: "c", user_id: "test", title: "Beta", url: "invalid", created_at: "2026-03-01T00:00:00Z" },
];
const ids = (items: Bookmark[]) => items.map(({ id }) => id);

describe("bookmark sorting", () => {
  it.each<[BookmarkSortOrder, string[]]>([
    ["saved-desc", ["c", "b", "a"]], ["saved-asc", ["a", "b", "c"]],
    ["name-asc", ["b", "a", "c"]], ["name-desc", ["c", "a", "b"]],
    ["website-asc", ["b", "a", "c"]], ["website-desc", ["a", "b", "c"]],
  ])("sorts %s without changing the source", (order, expected) => {
    expect(ids(sortBookmarks(bookmarks, { order, favoritesFirst: false }))).toEqual(expected);
    expect(ids(bookmarks)).toEqual(["a", "b", "c"]);
  });
  it("orders Favorites by favorite time independently of saved time", () => {
    expect(ids(sortBookmarks(bookmarks.slice(0, 2), { order: "favorited-desc", favoritesFirst: false }))).toEqual(["a", "b"]);
    expect(ids(sortBookmarks(bookmarks.slice(0, 2), { order: "favorited-asc", favoritesFirst: false }))).toEqual(["b", "a"]);
  });
  it("groups favorites first while retaining the chosen order within groups", () => {
    expect(ids(sortBookmarks(bookmarks, { order: "saved-desc", favoritesFirst: true }))).toEqual(["b", "a", "c"]);
    expect(ids(sortBookmarks(bookmarks, { order: "default", favoritesFirst: false }))).toEqual(ids(bookmarks));
  });
  it("ranks deliberate opens first and uses saved date for ties", () => {
    const withUsage = bookmarks.map((bookmark) => ({ ...bookmark, open_count: bookmark.id === "a" ? 3 : bookmark.id === "c" ? 1 : 0 }));
    expect(ids(sortBookmarks(withUsage, { order: "most-used", favoritesFirst: false }))).toEqual(["a", "c", "b"]);
    expect(ids(sortBookmarks(bookmarks, { order: "most-used", favoritesFirst: false }))).toEqual(["c", "b", "a"]);
  });
  it("breaks ties deterministically and handles accented names and invalid dates", () => {
    const same = bookmarks.map((item) => ({ ...item, title: "École", created_at: "invalid" })).reverse();
    expect(ids(sortBookmarks(same, { order: "name-asc", favoritesFirst: false }))).toEqual(["a", "b", "c"]);
  });
  it("sorts mixed library entries by their displayed name", () => {
    const note: Note = { id: "note", user_id: "test", kind: "note", title: "Aardvark", content: "", created_at: "2026-01-01", updated_at: "2026-01-01" };
    const items = mergeHomeLibraryItems(bookmarks, [note], []);
    expect(sortLibraryItems(items, { order: "name-asc", favoritesFirst: false }).map(({ id }) => id)).toEqual(["note", "b", "a", "c"]);
  });
  it("sorts all search matches before selecting a bounded page", () => {
    const stored = Array.from({ length: 150 }, (_, index) => {
      const bookmark = { ...bookmarks[0], id: `${index}`, title: `Article ${150 - index}` };
      return { ...bookmark, __searchText: buildSearchText(bookmark) };
    });
    const sorting = { order: "name-asc" as const, favoritesFirst: false };
    const first = searchStoredBookmarks(stored, "article", { limit: 100, sorting });
    const second = searchStoredBookmarks(stored, "article", { offset: 100, limit: 100, sorting });
    expect(first.total).toBe(150);
    expect(first.bookmarks[0].title).toBe("Article 1");
    expect(first.bookmarks[99].title).toBe("Article 100");
    expect(second.bookmarks[0].title).toBe("Article 101");
    expect(second.bookmarks.at(-1)?.title).toBe("Article 150");
  });
});
