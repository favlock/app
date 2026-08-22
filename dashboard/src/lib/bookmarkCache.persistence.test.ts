import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { Bookmark, Entry, Folder, Tag } from "../types/bookmark";
import {
  applyLibraryContentCacheDelta,
  applyBookmarkCacheDelta,
  getBookmarkCacheMeta,
  getCachedBookmarksForUser,
  getCachedEntriesForUser,
  getCachedFoldersForUser,
  getCachedTagsForUser,
  getCachedTrashForUser,
  getLibraryContentCacheMeta,
  replaceCachedBookmarksForUser,
  replaceCachedLibraryContentForUser,
  type LibraryContentSnapshot,
} from "./bookmarkCache";

const bookmark = (
  id: string,
  userId = "user-1",
  title = `Bookmark ${id}`,
): Bookmark => ({
  id,
  user_id: userId,
  title,
  url: `https://example.com/${id}`,
  created_at: "2026-08-10T10:00:00.000Z",
  folders: [],
  tags: [],
});

const contentSnapshot = (suffix: string): LibraryContentSnapshot => ({
  entries: [
    {
      id: `entry-${suffix}`,
      user_id: "user-1",
      kind: "note",
      title: `Note ${suffix}`,
      content: "Body",
      created_at: "2026-08-10T10:00:00.000Z",
      updated_at: "2026-08-10T10:00:00.000Z",
      folder: null,
      tags: [],
    } as Entry,
  ],
  folders: [
    {
      id: `folder-${suffix}`,
      user_id: "user-1",
      name: `Folder ${suffix}`,
    } as Folder,
  ],
  tags: [
    { id: `tag-${suffix}`, user_id: "user-1", name: `Tag ${suffix}` } as Tag,
  ],
  trash: [
    {
      id: `trash-${suffix}`,
      user_id: "user-1",
      resourceId: `deleted-${suffix}`,
      resourceType: "bookmark",
      title: `Deleted ${suffix}`,
      url: null,
      deletedAt: "2026-08-10T10:00:00.000Z",
      expiresAt: "2026-08-17T10:00:00.000Z",
    },
  ],
});

describe("bookmark cache persistence", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: new IDBFactory(),
    });
  });

  it("atomically replaces only the requested user's snapshot", async () => {
    await replaceCachedBookmarksForUser(
      "user-1",
      [bookmark("old-a"), bookmark("old-b")],
      { revision: "1", lastSyncedAt: "2026-08-10T10:00:00.000Z" },
    );
    await replaceCachedBookmarksForUser(
      "user-2",
      [bookmark("other", "user-2")],
      { revision: "4", lastSyncedAt: "2026-08-10T10:00:00.000Z" },
    );

    await replaceCachedBookmarksForUser("user-1", [bookmark("current")], {
      revision: "2",
      lastSyncedAt: "2026-08-10T10:05:00.000Z",
    });

    expect(
      (await getCachedBookmarksForUser("user-1")).map((item) => item.id),
    ).toEqual(["current"]);
    expect(
      (await getCachedBookmarksForUser("user-2")).map((item) => item.id),
    ).toEqual(["other"]);
    expect(await getBookmarkCacheMeta("user-1")).toMatchObject({
      revision: "2",
    });
  });

  it("commits upserts, deletes, and the revision together", async () => {
    await replaceCachedBookmarksForUser(
      "user-1",
      [bookmark("a"), bookmark("b")],
      { revision: "10", lastSyncedAt: "2026-08-10T10:00:00.000Z" },
    );

    await applyBookmarkCacheDelta("user-1", {
      upserts: [bookmark("a", "user-1", "Updated A")],
      deletes: ["b"],
      revision: "12",
      lastSyncedAt: "2026-08-10T10:05:00.000Z",
    });

    expect(await getCachedBookmarksForUser("user-1")).toEqual([
      expect.objectContaining({ id: "a", title: "Updated A" }),
    ]);
    expect(await getBookmarkCacheMeta("user-1")).toMatchObject({
      revision: "12",
      lastSyncedAt: "2026-08-10T10:05:00.000Z",
    });
  });

  it("does not let an older tab regress a newer cache revision", async () => {
    await replaceCachedBookmarksForUser("user-1", [bookmark("current")], {
      revision: "12",
      lastSyncedAt: "2026-08-10T10:05:00.000Z",
    });

    await applyBookmarkCacheDelta("user-1", {
      upserts: [bookmark("stale")],
      deletes: ["current"],
      revision: "11",
      lastSyncedAt: "2026-08-10T10:04:00.000Z",
    });

    expect(
      (await getCachedBookmarksForUser("user-1")).map((item) => item.id),
    ).toEqual(["current"]);
    expect(await getBookmarkCacheMeta("user-1")).toMatchObject({
      revision: "12",
    });
  });

  it("rejects cross-user rows before changing data or metadata", async () => {
    await replaceCachedBookmarksForUser("user-1", [bookmark("current")], {
      revision: "1",
      lastSyncedAt: "2026-08-10T10:00:00.000Z",
    });

    await expect(
      applyBookmarkCacheDelta("user-1", {
        upserts: [bookmark("foreign", "user-2")],
        deletes: ["current"],
        revision: "2",
        lastSyncedAt: "2026-08-10T10:05:00.000Z",
      }),
    ).rejects.toThrow("another user's bookmark");

    expect(
      (await getCachedBookmarksForUser("user-1")).map((item) => item.id),
    ).toEqual(["current"]);
    expect(await getBookmarkCacheMeta("user-1")).toMatchObject({
      revision: "1",
    });
  });

  it("atomically replaces and patches all locally cached library content", async () => {
    await replaceCachedLibraryContentForUser(
      "user-1",
      contentSnapshot("old"),
      { revision: "4", lastSyncedAt: "2026-08-10T10:00:00.000Z" },
    );

    await applyLibraryContentCacheDelta("user-1", {
      upserts: contentSnapshot("new"),
      deletes: {
        entries: ["entry-old"],
        folders: ["folder-old"],
        tags: ["tag-old"],
        trash: ["trash-old"],
      },
      revision: "5",
      lastSyncedAt: "2026-08-10T10:05:00.000Z",
    });

    expect((await getCachedEntriesForUser("user-1")).map(({ id }) => id)).toEqual(["entry-new"]);
    expect((await getCachedFoldersForUser("user-1")).map(({ id }) => id)).toEqual(["folder-new"]);
    expect((await getCachedTagsForUser("user-1")).map(({ id }) => id)).toEqual(["tag-new"]);
    expect((await getCachedTrashForUser("user-1")).map(({ id }) => id)).toEqual(["trash-new"]);
    expect(await getLibraryContentCacheMeta("user-1")).toMatchObject({
      revision: "5",
      lastSyncedAt: "2026-08-10T10:05:00.000Z",
    });
  });
});
