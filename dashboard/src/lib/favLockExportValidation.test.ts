import { describe, expect, it } from "vitest";
import type { Bookmark, Folder, Note, Tag, Todo } from "../types/bookmark";
import { buildFavLockExport, type ExportSourceData } from "./dataExport";
import {
  parseFavLockExport,
  summarizeFavLockExport,
} from "./favLockExportValidation";

const timestamp = "2026-08-25T09:00:00.000Z";
const rootFolder: Folder = {
  id: "10000000-0000-4000-8000-000000000001",
  user_id: "source-user",
  name: "Work",
  color: "BLUE",
  parent_id: null,
  sort_order: 0,
  created_at: timestamp,
};
const childFolder: Folder = {
  ...rootFolder,
  id: "10000000-0000-4000-8000-000000000002",
  name: "Research",
  parent_id: rootFolder.id,
};
const tag: Tag = {
  id: "20000000-0000-4000-8000-000000000001",
  user_id: "source-user",
  name: "ideas",
  created_at: timestamp,
};
const bookmark: Bookmark = {
  id: "30000000-0000-4000-8000-000000000001",
  user_id: "source-user",
  title: "Example",
  url: "https://example.com",
  folders: [childFolder],
  tags: [tag],
  is_favorite: true,
  favorited_at: timestamp,
  created_at: timestamp,
};
const note: Note = {
  id: "40000000-0000-4000-8000-000000000001",
  user_id: "source-user",
  kind: "note",
  title: "Note",
  content: "<p>Safe <script>bad()</script>content</p>",
  folder: rootFolder,
  tags: [tag],
  created_at: timestamp,
  updated_at: timestamp,
};
const todo: Todo = {
  ...note,
  id: "40000000-0000-4000-8000-000000000002",
  kind: "todo",
  is_completed: true,
  completed_at: timestamp,
  due_date: "2026-08-30",
};
const source: ExportSourceData = {
  folders: [rootFolder, childFolder],
  tags: [tag],
  bookmarks: [bookmark],
  notes: [note],
  todos: [todo],
  readspace: [],
};
const selection = {
  bookmarks: true,
  notes: true,
  todos: true,
  readspace: true,
};

describe("FavLock export validation", () => {
  it("validates relationships, sanitizes content, and summarizes the archive", () => {
    const parsed = parseFavLockExport(
      buildFavLockExport(source, selection, new Date(timestamp)),
    );

    expect(parsed.data.notes?.[0].content).toBe("<p>Safe content</p>");
    expect(parsed.data.todos?.[0].dueDate).toBe("2026-08-30");
    expect(summarizeFavLockExport(parsed)).toEqual({
      collections: 2,
      tags: 1,
      bookmarks: 1,
      notes: 1,
      todos: 1,
      readspace: 0,
    });
  });

  it("rejects unknown relationships and unsupported nesting", () => {
    const archive = buildFavLockExport(source, selection);
    const unknownTag = structuredClone(archive);
    unknownTag.data.bookmarks![0].tagIds = [
      "90000000-0000-4000-8000-000000000001",
    ];
    expect(() => parseFavLockExport(unknownTag)).toThrow("not a valid");

    const nestedTooDeep = structuredClone(archive);
    nestedTooDeep.data.collections.push({
      ...nestedTooDeep.data.collections[1],
      id: "10000000-0000-4000-8000-000000000003",
      parentId: childFolder.id,
    });
    expect(() => parseFavLockExport(nestedTooDeep)).toThrow("not a valid");
  });

  it("rejects inconsistent completion metadata and duplicate ids", () => {
    const archive = buildFavLockExport(source, selection);
    const inconsistentTodo = structuredClone(archive);
    inconsistentTodo.data.todos![0].completedAt = null;
    expect(() => parseFavLockExport(inconsistentTodo)).toThrow("not a valid");

    const duplicateFolder = structuredClone(archive);
    duplicateFolder.data.collections.push(duplicateFolder.data.collections[0]);
    expect(() => parseFavLockExport(duplicateFolder)).toThrow("not a valid");
  });
});
