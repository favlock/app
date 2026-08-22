import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchBookmarkSyncStatus: vi.fn(),
  fetchBookmarkSyncChanges: vi.fn(),
  fetchEncryptedLibraryBookmarks: vi.fn(),
  getBookmarkCacheMeta: vi.fn(),
  applyBookmarkCacheDelta: vi.fn(),
  replaceCachedBookmarksForUser: vi.fn(),
}));

vi.mock("./bookmarkSyncApi", () => ({
  fetchBookmarkSyncStatus: mocks.fetchBookmarkSyncStatus,
  fetchBookmarkSyncChanges: mocks.fetchBookmarkSyncChanges,
}));

vi.mock("./libraryContentApi", () => ({
  fetchEncryptedLibraryBookmarks: mocks.fetchEncryptedLibraryBookmarks,
}));

vi.mock("./bookmarkCache", () => ({
  getBookmarkCacheMeta: mocks.getBookmarkCacheMeta,
  applyBookmarkCacheDelta: mocks.applyBookmarkCacheDelta,
  replaceCachedBookmarksForUser: mocks.replaceCachedBookmarksForUser,
}));

import { syncBookmarksToLocalCache } from "./bookmarkSync";

const bookmarkId = "11111111-1111-4111-8111-111111111111";
const deletedBookmarkId = "22222222-2222-4222-8222-222222222222";

function encryptedBookmark(id: string) {
  return {
    id,
    encryptedTitle: `encrypted-title-${id}`,
    encryptedUrl: `encrypted-url-${id}`,
    isFavorite: false,
    favoritedAt: null,
    createdAt: "2026-08-10T10:00:00.000Z",
    folders: [],
    tags: [],
  };
}

describe("bookmark incremental sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchBookmarkSyncChanges.mockResolvedValue([]);
    mocks.fetchEncryptedLibraryBookmarks.mockResolvedValue([]);
    mocks.applyBookmarkCacheDelta.mockResolvedValue(undefined);
    mocks.replaceCachedBookmarksForUser.mockResolvedValue(undefined);
  });

  it("validates an unchanged cache without downloading bookmarks", async () => {
    mocks.getBookmarkCacheMeta.mockResolvedValue({
      key: "sync:user-1",
      revision: "10",
      lastSyncedAt: "2026-08-10T09:00:00.000Z",
    });
    mocks.fetchBookmarkSyncStatus.mockResolvedValue({
      revision: "10",
      deltaFloor: "0",
    });

    const result = await syncBookmarksToLocalCache(
      "user-1",
      "current.jwt.token",
      async (value) => value,
    );

    expect(mocks.fetchEncryptedLibraryBookmarks).not.toHaveBeenCalled();
    expect(mocks.fetchBookmarkSyncChanges).not.toHaveBeenCalled();
    expect(mocks.applyBookmarkCacheDelta).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        upserts: [],
        deletes: [],
        revision: "10",
      }),
    );
    expect(result).toMatchObject({
      revision: "10",
      changed: false,
      rebuilt: false,
    });
  });

  it("fetches only dirty upserts and applies deletions", async () => {
    mocks.getBookmarkCacheMeta.mockResolvedValue({
      key: "sync:user-1",
      revision: "10",
      lastSyncedAt: "2026-08-10T09:00:00.000Z",
    });
    mocks.fetchBookmarkSyncStatus.mockResolvedValue({
      revision: "12",
      deltaFloor: "0",
    });
    mocks.fetchBookmarkSyncChanges.mockResolvedValue([
      { bookmarkId, revision: "11", operation: "upsert" },
      { bookmarkId: deletedBookmarkId, revision: "12", operation: "delete" },
    ]);
    mocks.fetchEncryptedLibraryBookmarks.mockResolvedValue([
      encryptedBookmark(bookmarkId),
    ]);

    const result = await syncBookmarksToLocalCache(
      "user-1",
      "current.jwt.token",
      async (value) => `plain:${value}`,
    );

    expect(mocks.fetchBookmarkSyncChanges).toHaveBeenCalledWith(
      "current.jwt.token",
      "10",
      "12",
    );
    expect(mocks.fetchEncryptedLibraryBookmarks).toHaveBeenCalledWith(
      "current.jwt.token",
      [bookmarkId],
    );
    expect(mocks.applyBookmarkCacheDelta).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        revision: "12",
        deletes: [deletedBookmarkId],
        upserts: [
          expect.objectContaining({
            id: bookmarkId,
            user_id: "user-1",
            title: `plain:encrypted-title-${bookmarkId}`,
          }),
        ],
      }),
    );
    expect(mocks.replaceCachedBookmarksForUser).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      revision: "12",
      changed: true,
      rebuilt: false,
    });
  });

  it("stages a complete replacement when the local revision expired", async () => {
    mocks.getBookmarkCacheMeta.mockResolvedValue({
      key: "sync:user-1",
      revision: "3",
      lastSyncedAt: "2026-07-01T09:00:00.000Z",
    });
    mocks.fetchBookmarkSyncStatus.mockResolvedValue({
      revision: "20",
      deltaFloor: "10",
    });
    mocks.fetchEncryptedLibraryBookmarks.mockResolvedValue([
      encryptedBookmark(bookmarkId),
    ]);

    const result = await syncBookmarksToLocalCache(
      "user-1",
      "current.jwt.token",
      async (value) => value,
    );

    expect(mocks.fetchEncryptedLibraryBookmarks).toHaveBeenCalledWith(
      "current.jwt.token",
    );
    expect(mocks.replaceCachedBookmarksForUser).toHaveBeenCalledWith(
      "user-1",
      [expect.objectContaining({ id: bookmarkId })],
      expect.objectContaining({ revision: "20" }),
    );
    expect(mocks.applyBookmarkCacheDelta).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      revision: "20",
      changed: true,
      rebuilt: true,
    });
  });

  it("rebuilds safely when the change feed requests a reset", async () => {
    mocks.getBookmarkCacheMeta.mockResolvedValue({
      key: "sync:user-1",
      revision: "10",
      lastSyncedAt: "2026-08-10T09:00:00.000Z",
    });
    mocks.fetchBookmarkSyncStatus.mockResolvedValue({
      revision: "12",
      deltaFloor: "0",
    });
    mocks.fetchBookmarkSyncChanges.mockRejectedValue(
      new Error("Bookmark sync reset required."),
    );
    mocks.fetchEncryptedLibraryBookmarks.mockResolvedValue([
      encryptedBookmark(bookmarkId),
    ]);

    await expect(
      syncBookmarksToLocalCache(
        "user-1",
        "current.jwt.token",
        async (value) => value,
      ),
    ).resolves.toMatchObject({ revision: "12", rebuilt: true });
    expect(mocks.replaceCachedBookmarksForUser).toHaveBeenCalledWith(
      "user-1",
      [expect.objectContaining({ id: bookmarkId })],
      expect.objectContaining({ revision: "12" }),
    );
  });
});
