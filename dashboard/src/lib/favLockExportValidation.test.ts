import { describe, expect, it } from "vitest";
import type {
  Bookmark,
  BookmarkList,
  Folder,
  Note,
  Tag,
  Todo,
} from "../types/bookmark";
import type { WebHighlight } from "../hooks/useHighlightsQuery";
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
  content: "<h2>Writing</h2><p>Safe <script>bad()</script><mark>content</mark></p>",
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
const list: BookmarkList = {
  id: "50000000-0000-4000-8000-000000000001",
  user_id: "source-user",
  name: "Watch later",
  created_at: timestamp,
  updated_at: timestamp,
  items: [{
    bookmark,
    position: 0,
    completed_at: timestamp,
    created_at: timestamp,
  }],
};
const highlight: WebHighlight = {
  id: "60000000-0000-4000-8000-000000000001",
  bookmarkId: bookmark.id,
  createdAt: timestamp,
  updatedAt: timestamp,
  payload: {
    version: 1,
    quote: { exact: "Important quote", prefix: "Before", suffix: "After" },
    position: null,
    dom: null,
    color: "blue",
    note: "Private annotation",
    capturedAt: timestamp,
  },
};
const source: ExportSourceData = {
  folders: [rootFolder, childFolder],
  tags: [tag],
  bookmarks: [bookmark],
  lists: [list],
  notes: [note],
  todos: [todo],
  readspace: [],
  highlights: [highlight],
};
const selection = {
  bookmarks: true,
  notes: true,
  todos: true,
  readspace: true,
  highlights: true,
};

describe("FavLock export validation", () => {
  it("validates relationships, sanitizes content, and summarizes the archive", () => {
    const parsed = parseFavLockExport(
      buildFavLockExport(source, selection, new Date(timestamp)),
    );

    expect(parsed.data.notes?.[0].content).toBe("<h2>Writing</h2><p>Safe <mark>content</mark></p>");
    expect(parsed.version).toBe(2);
    expect(parsed.data.todos?.[0].dueDate).toBe("2026-08-30");
    expect(summarizeFavLockExport(parsed)).toEqual({
      collections: 2,
      tags: 1,
      bookmarks: 1,
      lists: 1,
      notes: 1,
      todos: 1,
      readspace: 0,
      highlights: 1,
    });
  });

  it("rejects List memberships that reference bookmarks outside the archive", () => {
    const archive = buildFavLockExport(source, selection);
    archive.data.lists![0].items[0].bookmarkId =
      "90000000-0000-4000-8000-000000000001";

    expect(() => parseFavLockExport(archive)).toThrow("not a valid");
  });

  it("keeps version-two archives created before List support compatible", () => {
    const archive = buildFavLockExport(source, {
      ...selection,
      highlights: false,
    });
    delete archive.data.lists;

    const parsed = parseFavLockExport(archive);
    expect(parsed.data.lists).toBeUndefined();
    expect(summarizeFavLockExport(parsed).lists).toBe(0);
  });

  it("keeps version-two archives created before highlight support compatible", () => {
    const archive = buildFavLockExport(source, selection);
    archive.version = 2;
    delete archive.selection.highlights;
    delete archive.data.highlights;

    const parsed = parseFavLockExport(archive);
    expect(parsed.data.highlights).toBeUndefined();
    expect(summarizeFavLockExport(parsed).highlights).toBe(0);
  });

  it("rejects highlights whose source bookmark is outside the archive", () => {
    const archive = buildFavLockExport(source, selection);
    archive.data.highlights![0].bookmarkId =
      "90000000-0000-4000-8000-000000000001";

    expect(() => parseFavLockExport(archive)).toThrow("not a valid");
  });

  it("accepts a Pro archive above the former 10,000-bookmark ceiling", () => {
    const archive = buildFavLockExport(source, selection);
    const first = archive.data.bookmarks![0];
    archive.data.bookmarks = Array.from({ length: 10_001 }, (_, index) =>
      index === 0
        ? first
        : {
            ...first,
            id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
            title: `Bookmark ${index}`,
            url: `https://example.com/${index}`,
          },
    );

    expect(summarizeFavLockExport(parseFavLockExport(archive)).bookmarks).toBe(
      10_001,
    );
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
