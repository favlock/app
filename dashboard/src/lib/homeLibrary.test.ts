import { describe, expect, it } from "vitest";
import { mergeHomeLibraryItems } from "./homeLibrary";
import type { Bookmark, Note, ReadspaceEntry, Todo } from "../types/bookmark";
import type { ReadspaceContent } from "./readspaceContent";

const bookmarks: Bookmark[] = [
  {
    id: "bookmark-new",
    user_id: "user-1",
    title: "New bookmark",
    url: "https://new.example",
    created_at: "2026-08-04T09:00:00.000Z",
  },
  {
    id: "bookmark-old",
    user_id: "user-1",
    title: "Old bookmark",
    url: "https://old.example",
    created_at: "2026-08-01T09:00:00.000Z",
  },
];

const notes: Note[] = [
  {
    kind: "note",
    id: "note-updated",
    user_id: "user-1",
    title: "Updated note",
    content: "<p>Note</p>",
    created_at: "2026-07-01T09:00:00.000Z",
    updated_at: "2026-08-04T10:00:00.000Z",
  },
];

const todos: Todo[] = [
  {
    kind: "todo",
    id: "todo-newest",
    user_id: "user-1",
    title: "Newest todo",
    content: "",
    is_completed: false,
    completed_at: null,
    created_at: "2026-08-02T09:00:00.000Z",
    updated_at: "2026-08-04T11:00:00.000Z",
  },
];

const article: { entry: ReadspaceEntry; content: ReadspaceContent } = {
  entry: {
    kind: "read",
    id: "article-latest",
    user_id: "user-1",
    title: "Latest article",
    content: "{}",
    created_at: "2026-08-05T09:00:00.000Z",
    updated_at: "2026-08-05T09:00:00.000Z",
  },
  content: {
    version: 5,
    title: "Latest article",
    siteName: "Example",
    byline: "Author",
    publishedAt: "",
    updatedAt: "",
    sourceUrl: "https://example.com/article",
    html: "<p>Article</p>",
    capturedAt: "2026-08-05T09:00:00.000Z",
  },
};

describe("home library", () => {
  it("merges bookmarks, notes, todos, and articles by creation date", () => {
    const items = mergeHomeLibraryItems(bookmarks, notes, todos, [article]);

    expect(items.map((item) => `${item.kind}:${item.id}`)).toEqual([
      "read:article-latest",
      "bookmark:bookmark-new",
      "todo:todo-newest",
      "bookmark:bookmark-old",
      "note:note-updated",
    ]);
  });
});
