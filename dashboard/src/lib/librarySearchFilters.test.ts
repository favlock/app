import { describe, expect, it } from "vitest";
import { DEFAULT_LIBRARY_SEARCH_FILTERS, hasActiveLibrarySearch, matchesLibraryMetadata, matchesLibraryText } from "./librarySearchFilters";

describe("library search filters", () => {
  it("starts a search from a filter without requiring query text", () => {
    expect(hasActiveLibrarySearch("", DEFAULT_LIBRARY_SEARCH_FILTERS)).toBe(false);
    expect(hasActiveLibrarySearch("", { ...DEFAULT_LIBRARY_SEARCH_FILTERS, tagId: "tag-1" })).toBe(true);
    expect(hasActiveLibrarySearch("", { ...DEFAULT_LIBRARY_SEARCH_FILTERS, field: "title" })).toBe(false);
  });

  it("keeps words within the selected field and combines exact metadata filters", () => {
    const values = { title: "Design notes", url: "https://example.test/work", tags: "Research", collection: "Work" };
    expect(matchesLibraryText("work", "title", values)).toBe(false);
    expect(matchesLibraryText("work", "url", values)).toBe(true);
    expect(matchesLibraryText("research", "tag", values)).toBe(true);
    expect(matchesLibraryText("work", "collection", values)).toBe(true);
    expect(matchesLibraryMetadata({ ...DEFAULT_LIBRARY_SEARCH_FILTERS, tagId: "tag-1", collectionId: "folder-1" }, "bookmark", "folder-1", ["tag-1"])).toBe(true);
    expect(matchesLibraryMetadata({ ...DEFAULT_LIBRARY_SEARCH_FILTERS, tagId: "tag-1", collectionId: "folder-1" }, "bookmark", "folder-2", ["tag-1"])).toBe(false);
  });

  it("limits favorites to bookmarks", () => {
    const filters = { ...DEFAULT_LIBRARY_SEARCH_FILTERS, favoritesOnly: true };
    expect(matchesLibraryMetadata(filters, "bookmark", null, [], true)).toBe(true);
    expect(matchesLibraryMetadata(filters, "bookmark", null, [], false)).toBe(false);
    expect(matchesLibraryMetadata(filters, "note", null, [], true)).toBe(false);
  });
});
