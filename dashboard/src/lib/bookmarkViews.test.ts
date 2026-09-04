import { describe, expect, it } from "vitest";
import type { Bookmark, Folder, Tag } from "../types/bookmark";
import { bookmarksForView } from "./bookmarkViews";

const bookmark = (
  id: string,
  overrides: Partial<Bookmark> = {},
): Bookmark => ({
  id,
  user_id: "user-1",
  title: id,
  url: `https://${id}.example`,
  created_at: `2026-08-0${id}.000Z`,
  folders: [],
  tags: [],
  ...overrides,
});

const bookmarks = [
  bookmark("1", {
    is_favorite: true,
    favorited_at: "2026-08-03T00:00:00.000Z",
    folders: [{ id: "folder-a" } as Folder],
    tags: [{ id: "tag-a" } as Tag],
  }),
  bookmark("2", {
    is_favorite: true,
    favorited_at: "2026-08-04T00:00:00.000Z",
    folders: [{ id: "folder-b" } as Folder],
  }),
  bookmark("3"),
  bookmark("4", { is_highlight_source: true }),
];

describe("bookmarksForView", () => {
  it("filters folder, tag, and unsorted views locally", () => {
    expect(bookmarksForView(bookmarks, { kind: "folder", id: "folder-a" }).map(({ id }) => id)).toEqual(["1"]);
    expect(bookmarksForView(bookmarks, { kind: "tag", id: "tag-a" }).map(({ id }) => id)).toEqual(["1"]);
    expect(bookmarksForView(bookmarks, { kind: "unsorted" }).map(({ id }) => id)).toEqual(["3"]);
  });

  it("sorts normal views by creation time and favorites by favorite time", () => {
    expect(bookmarksForView(bookmarks, { kind: "all" }).map(({ id }) => id)).toEqual(["3", "2", "1"]);
    expect(bookmarksForView(bookmarks, { kind: "favorites" }).map(({ id }) => id)).toEqual(["2", "1"]);
  });

  it("keeps internal highlight sources out of every bookmark view", () => {
    expect(bookmarksForView(bookmarks, { kind: "all" }).map(({ id }) => id))
      .not.toContain("4");
    expect(bookmarksForView(bookmarks, { kind: "unsorted" }).map(({ id }) => id))
      .not.toContain("4");
  });
});
