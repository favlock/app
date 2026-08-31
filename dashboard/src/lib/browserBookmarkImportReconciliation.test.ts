import { describe, expect, it } from "vitest";
import type { Bookmark, Folder } from "../types/bookmark";
import {
  bookmarkMatchesImportedOverwrite,
  findReconciledCreatedBookmark,
} from "./browserBookmarkImportReconciliation";
import type { PreparedBrowserBookmarkImportItem } from "./browserBookmarkImportPlan";

const root: Folder = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "user-1",
  name: "Work",
  color: null,
  parent_id: null,
  sort_order: 0,
  created_at: "2026-08-29T10:00:00.000Z",
};
const child: Folder = {
  ...root,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Reading",
  parent_id: root.id,
};
const item: PreparedBrowserBookmarkImportItem = {
  index: 0,
  title: "Example",
  url: "https://example.test/",
  folderPath: ["Work", "Reading"],
  duplicate: null,
  existingBookmark: null,
};

function bookmark(id: string): Bookmark {
  return {
    id,
    user_id: "user-1",
    title: "Example",
    url: "https://example.test",
    created_at: "2026-08-29T10:00:00.000Z",
    folders: [child],
    tags: [],
  };
}

describe("ambiguous import mutation reconciliation", () => {
  it("recognizes exactly one matching bookmark created after the write began", () => {
    const created = bookmark("33333333-3333-4333-8333-333333333333");
    expect(
      findReconciledCreatedBookmark(item, [], {
        bookmarks: [created],
        folders: [root, child],
      }),
    ).toEqual(created);
  });

  it("does not claim a pre-existing matching bookmark as the uncertain create", () => {
    const existing = bookmark("33333333-3333-4333-8333-333333333333");
    expect(
      findReconciledCreatedBookmark(item, [existing.id], {
        bookmarks: [existing],
        folders: [root, child],
      }),
    ).toBeNull();
  });

  it("keeps the outcome unknown when competing attempts created multiple matches", () => {
    expect(
      findReconciledCreatedBookmark(item, [], {
        bookmarks: [
          bookmark("33333333-3333-4333-8333-333333333333"),
          bookmark("44444444-4444-4444-8444-444444444444"),
        ],
        folders: [root, child],
      }),
    ).toBe("ambiguous");
  });

  it("reconciles overwrite content and collection independently", () => {
    const existing = bookmark("33333333-3333-4333-8333-333333333333");
    expect(
      bookmarkMatchesImportedOverwrite(existing.id, item, {
        bookmarks: [existing],
        folders: [root, child],
      }),
    ).toEqual({ content: true, folder: true });
  });
});
