import { describe, expect, it } from "vitest";
import type { Bookmark, Folder } from "../types/bookmark";
import { prepareBrowserBookmarkImport } from "./browserBookmarkImportPlan";

const plan = {
  limits: {
    bookmarks: 5,
    entries: 0,
    readspace: 0,
    highlights: 0,
    collections: 3,
    tags: 0,
    lists: 0,
  },
};

function bookmark(id: string, url: string): Bookmark {
  return {
    id,
    user_id: "user-1",
    title: id,
    url,
    created_at: "2026-08-29T10:00:00.000Z",
    folders: [],
    tags: [],
  };
}

function folder(id: string, name: string): Folder {
  return {
    id,
    user_id: "user-1",
    name,
    color: null,
    parent_id: null,
    sort_order: 0,
    created_at: "2026-08-29T10:00:00.000Z",
  };
}

describe("browser bookmark import preflight", () => {
  it("reports mixed valid, invalid, library duplicate, and source duplicate records", async () => {
    const preview = await prepareBrowserBookmarkImport(
      {
        bookmarks: [
          { title: "New", url: "https://new.test", folderPath: ["Work"] },
          { title: "Existing", url: "https://existing.test", folderPath: [] },
          { title: "Again", url: "https://new.test", folderPath: [] },
          { title: "Unsafe", url: "javascript:alert(1)", folderPath: [] },
        ],
        folderPaths: [["Work"]],
      },
      [bookmark("11111111-1111-4111-8111-111111111111", "https://existing.test/")],
      [],
      plan,
      { bookmarks: 1, collections: 0 },
    );

    expect(preview).toMatchObject({
      totalCount: 4,
      validCount: 3,
      invalidCount: 1,
      duplicateCount: 2,
      sourceDuplicateCount: 1,
      libraryDuplicateCount: 1,
      readyToAddCount: 1,
      availableBookmarks: 4,
      blockedReason: null,
    });
    expect(preview.invalidItems).toEqual([
      {
        index: 3,
        title: "Unsafe",
        url: "javascript:alert(1)",
        folderPath: [],
        reason: "Unsupported or invalid URL",
      },
    ]);
    expect(preview.newFolderPaths).toEqual([["Work"]]);
    expect(preview.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("blocks before writes instead of truncating when the minimum additions exceed quota", async () => {
    const preview = await prepareBrowserBookmarkImport(
      {
        bookmarks: [
          { title: "One", url: "https://one.test", folderPath: [] },
          { title: "Two", url: "https://two.test", folderPath: [] },
        ],
        folderPaths: [],
      },
      [],
      [],
      plan,
      { bookmarks: 4, collections: 0 },
    );

    expect(preview.blockedReason).toBe(
      "This import needs space for at least 2 new bookmarks, but your current plan has 1 remaining.",
    );
  });

  it("reuses existing collections during the allowance check", async () => {
    const preview = await prepareBrowserBookmarkImport(
      {
        bookmarks: [
          { title: "One", url: "https://one.test", folderPath: ["Work"] },
        ],
        folderPaths: [["Work"]],
      },
      [],
      [folder("22222222-2222-4222-8222-222222222222", "Work")],
      plan,
      { bookmarks: 0, collections: 2 },
    );

    expect(preview.newFolderPaths).toEqual([]);
    expect(preview.blockedReason).toBeNull();
  });

  it("treats a repeated import as duplicates instead of new writes", async () => {
    const existing = bookmark(
      "33333333-3333-4333-8333-333333333333",
      "https://repeat.test/",
    );
    const preview = await prepareBrowserBookmarkImport(
      {
        bookmarks: [
          { title: "Repeat", url: "https://repeat.test", folderPath: [] },
        ],
        folderPaths: [],
      },
      [existing],
      [],
      plan,
      { bookmarks: 1, collections: 0 },
    );

    expect(preview).toMatchObject({
      libraryDuplicateCount: 1,
      readyToAddCount: 0,
      duplicateCount: 1,
    });
  });

  it("handles a large supported synthetic fixture without changing the allowance", async () => {
    const bookmarks = Array.from({ length: 500 }, (_, index) => ({
      title: `Synthetic ${index}`,
      url: `https://fixture.test/${index}`,
      folderPath: ["Synthetic"],
    }));
    const preview = await prepareBrowserBookmarkImport(
      { bookmarks, folderPaths: [["Synthetic"]] },
      [],
      [],
      { ...plan, limits: { ...plan.limits, collections: 0 } },
      { bookmarks: 0, collections: 0 },
    );

    expect(preview.readyToAddCount).toBe(500);
    expect(preview.availableBookmarks).toBe(5);
    expect(preview.blockedReason).toContain("current plan has 5 remaining");
  });

  it("preflights the current 10,000-bookmark Pro allowance in bounded time", async () => {
    const bookmarks = Array.from({ length: 10_000 }, (_, index) => ({
      title: `Pro fixture ${index}`,
      url: `https://pro-fixture.test/${index}`,
      folderPath: ["Imported", `Batch ${Math.floor(index / 500)}`],
    }));
    const startedAt = performance.now();
    const preview = await prepareBrowserBookmarkImport(
      { bookmarks, folderPaths: [] },
      [],
      [],
      {
        ...plan,
        limits: { ...plan.limits, bookmarks: 10_000, collections: 0 },
      },
      { bookmarks: 0, collections: 0 },
    );

    expect(preview.readyToAddCount).toBe(10_000);
    expect(preview.blockedReason).toBeNull();
    expect(performance.now() - startedAt).toBeLessThan(5_000);
  });

  it("does not block a Pro import against the unlimited bookmark allowance", async () => {
    const preview = await prepareBrowserBookmarkImport(
      {
        bookmarks: [
          { title: "One", url: "https://one.test", folderPath: [] },
          { title: "Two", url: "https://two.test", folderPath: [] },
        ],
        folderPaths: [],
      },
      [],
      [],
      {
        ...plan,
        limits: { ...plan.limits, bookmarks: 0, collections: 0 },
      },
      { bookmarks: 50_000, collections: 0 },
    );

    expect(preview.bookmarkLimit).toBe(0);
    expect(preview.availableBookmarks).toBeNull();
    expect(preview.blockedReason).toBeNull();
  });
});
