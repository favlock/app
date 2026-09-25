import { describe, expect, it } from "vitest";
import type { Note } from "../types/bookmark";
import { searchNotes } from "./noteSearch";
import { DEFAULT_LIBRARY_SEARCH_FILTERS } from "./librarySearchFilters";

const note: Note = {
  id: "note-1",
  user_id: "user-1",
  kind: "note",
  title: "Project plan",
  content: "<p>Private body text</p>",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  folder: null,
  tags: [{ id: "tag-1", user_id: "user-1", name: "Work", created_at: "2026-01-01T00:00:00.000Z" }],
};

describe("document search filters", () => {
  it("finds matching documents with no words and targets the chosen field", () => {
    const filters = { ...DEFAULT_LIBRARY_SEARCH_FILTERS, itemType: "note" as const, tagId: "tag-1" };
    expect(searchNotes([note], "", { filters })).toHaveLength(1);
    expect(searchNotes([note], "work", { filters: { ...filters, field: "tag" } })).toHaveLength(1);
    expect(searchNotes([note], "work", { filters: { ...filters, field: "title" } })).toHaveLength(0);
    expect(searchNotes([note], "private", { includeContent: false, filters })).toHaveLength(0);
  });
});
