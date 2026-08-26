import { describe, expect, it } from "vitest";
import type {
  Bookmark,
  BookmarkList,
  Folder,
  Note,
  Tag,
  Todo,
} from "../types/bookmark";
import {
  buildBrowserBookmarksHtml,
  buildFavLockExport,
  type ExportSelection,
  type ExportSourceData,
} from "./dataExport";

const createdAt = "2026-08-06T12:00:00.000Z";
const folder = (
  id: string,
  name: string,
  parentId: string | null = null,
): Folder => ({
  id,
  user_id: "user-1",
  name,
  color: null,
  parent_id: parentId,
  sort_order: 0,
  created_at: createdAt,
});
const tag: Tag = {
  id: "tag-1",
  user_id: "user-1",
  name: "Research & ideas",
  created_at: createdAt,
};
const bookmark: Bookmark = {
  id: "bookmark-1",
  user_id: "user-1",
  title: "Example <site>",
  url: 'https://example.com/?q="moon"&page=1',
  created_at: createdAt,
  folders: [folder("child", "Child", "root")],
  tags: [tag],
};
const note: Note = {
  id: "note-1",
  user_id: "user-1",
  kind: "note",
  title: "A note",
  content: "<p>Plain text export</p>",
  created_at: createdAt,
  updated_at: createdAt,
  folder: null,
  tags: [tag],
};
const todo: Todo = {
  ...note,
  id: "todo-1",
  kind: "todo",
  is_completed: true,
  completed_at: createdAt,
};
const list: BookmarkList = {
  id: "list-1",
  user_id: "user-1",
  name: "Watch later",
  created_at: createdAt,
  updated_at: createdAt,
  items: [{
    bookmark,
    position: 0,
    completed_at: createdAt,
    created_at: createdAt,
  }],
};

const selection: ExportSelection = {
  bookmarks: true,
  notes: true,
  todos: false,
  readspace: false,
};

const source: ExportSourceData = {
  bookmarks: [bookmark],
  lists: [list],
  folders: [folder("root", "Root"), folder("child", "Child", "root")],
  tags: [tag],
  notes: [note],
  todos: [todo],
  readspace: [],
};

describe("FavLock data export", () => {
  it("includes only selected content and removes user identifiers", () => {
    const result = buildFavLockExport(
      source,
      selection,
      new Date("2026-08-06T13:00:00.000Z"),
    );

    expect(result).toMatchObject({
      format: "favlock-export",
      version: 2,
      exportedAt: "2026-08-06T13:00:00.000Z",
      encrypted: false,
      data: {
        bookmarks: [{ title: "Example <site>", tagIds: ["tag-1"] }],
        lists: [{
          name: "Watch later",
          items: [{ bookmarkId: "bookmark-1", completedAt: createdAt }],
        }],
        notes: [{ title: "A note", collectionId: null }],
      },
    });
    expect("todos" in result.data).toBe(false);
    expect(JSON.stringify(result)).not.toContain("user-1");
  });

  it("creates browser-compatible HTML with nesting, tags, and escaping", () => {
    const html = buildBrowserBookmarksHtml(source.bookmarks, source.folders);

    expect(html).toContain("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
    expect(html.indexOf(">Root</H3>")).toBeLessThan(
      html.indexOf(">Child</H3>"),
    );
    expect(html).toContain("Example &lt;site&gt;");
    expect(html).toContain(
      'HREF="https://example.com/?q=&quot;moon&quot;&amp;page=1"',
    );
    expect(html).toContain('TAGS="Research &amp; ideas"');
  });
});
