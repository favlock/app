import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLibraryContentCacheMeta: vi.fn(),
  applyLibraryContentCacheDelta: vi.fn(),
  replaceCachedLibraryContentForUser: vi.fn(),
  fetchTrashItems: vi.fn(),
  fetchLibrarySyncStatus: vi.fn(),
  fetchLibrarySyncChanges: vi.fn(),
  fetchEncryptedLibraryEntries: vi.fn(),
  fetchEncryptedLibraryFolders: vi.fn(),
  fetchEncryptedLibraryTags: vi.fn(),
}));

vi.mock("./bookmarkCache", () => ({
  getLibraryContentCacheMeta: mocks.getLibraryContentCacheMeta,
  applyLibraryContentCacheDelta: mocks.applyLibraryContentCacheDelta,
  replaceCachedLibraryContentForUser: mocks.replaceCachedLibraryContentForUser,
}));

vi.mock("./trashRepository", () => ({
  fetchTrashItems: mocks.fetchTrashItems,
}));

vi.mock("./librarySyncApi", () => ({
  fetchLibrarySyncStatus: mocks.fetchLibrarySyncStatus,
  fetchLibrarySyncChanges: mocks.fetchLibrarySyncChanges,
}));

vi.mock("./libraryContentApi", () => ({
  fetchEncryptedLibraryEntries: mocks.fetchEncryptedLibraryEntries,
  fetchEncryptedLibraryFolders: mocks.fetchEncryptedLibraryFolders,
  fetchEncryptedLibraryTags: mocks.fetchEncryptedLibraryTags,
}));

import { syncLibraryContentToLocalCache } from "./libraryContentSync";
import { cancelLocalVaultWork } from "./localVaultWork";

describe("library content incremental sync", () => {
  it("cancels queued work and never commits after explicit local cleanup", async () => {
    mocks.getLibraryContentCacheMeta.mockResolvedValue({ revision: "9", lastSyncedAt: "2026-08-10T09:00:00.000Z" });
    let finish!: (value: { revision: string; deltaFloor: string }) => void;
    mocks.fetchLibrarySyncStatus.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const sync = syncLibraryContentToLocalCache("logout-user", "token", async (value) => value);
    const rejected = expect(sync).rejects.toThrow("cancelled");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const queued = syncLibraryContentToLocalCache("logout-user", "token", async (value) => value);
    const queuedRejected = expect(queued).rejects.toThrow("cancelled");
    const cleanup = cancelLocalVaultWork("logout-user");
    finish({ revision: "9", deltaFloor: "0" });
    await Promise.all([rejected, queuedRejected, cleanup]);
    expect(mocks.applyLibraryContentCacheDelta).not.toHaveBeenCalled();
    expect(mocks.replaceCachedLibraryContentForUser).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyLibraryContentCacheDelta.mockResolvedValue(undefined);
  });

  it("validates an unchanged complete library cache without downloading rows", async () => {
    mocks.getLibraryContentCacheMeta.mockResolvedValue({
      key: "content-sync:user-1",
      revision: "9",
      lastSyncedAt: "2026-08-10T09:00:00.000Z",
    });
    mocks.fetchLibrarySyncStatus.mockResolvedValue({
      revision: "9",
      deltaFloor: "2",
    });

    const result = await syncLibraryContentToLocalCache(
      "user-1",
      "current.jwt.token",
      async (value) => value,
    );

    expect(mocks.fetchEncryptedLibraryEntries).not.toHaveBeenCalled();
    expect(mocks.fetchEncryptedLibraryFolders).not.toHaveBeenCalled();
    expect(mocks.fetchEncryptedLibraryTags).not.toHaveBeenCalled();
    expect(mocks.applyLibraryContentCacheDelta).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        revision: "9",
        upserts: { entries: [], folders: [], tags: [], trash: [] },
      }),
    );
    expect(result).toMatchObject({ revision: "9" });
  });

  it("resolves changed Trash rows through the API and decrypts them locally", async () => {
    const trashId = "11111111-1111-4111-8111-111111111111";
    mocks.getLibraryContentCacheMeta.mockResolvedValue({
      key: "content-sync:user-1",
      revision: "1",
      lastSyncedAt: "2026-08-20T09:00:00.000Z",
    });
    mocks.fetchLibrarySyncStatus.mockResolvedValue({
      revision: "2",
      deltaFloor: "0",
    });
    mocks.fetchLibrarySyncChanges.mockResolvedValue([
      {
        resourceType: "trash",
        resourceId: trashId,
        revision: "2",
        operation: "upsert",
      },
    ]);
    mocks.fetchTrashItems.mockResolvedValue([
      {
        id: trashId,
        resourceId: "22222222-2222-4222-8222-222222222222",
        resourceType: "bookmark",
        encryptedTitle: "enc:title",
        encryptedUrl: "enc:url",
        deletedAt: "2026-08-20T10:00:00.000Z",
        expiresAt: "2026-09-19T10:00:00.000Z",
      },
    ]);

    await syncLibraryContentToLocalCache(
      "user-1",
      "current.jwt.token",
      async (value) => `decrypted:${value}`,
    );

    expect(mocks.fetchTrashItems).toHaveBeenCalledExactlyOnceWith(
      "current.jwt.token",
      [trashId],
    );
    expect(mocks.fetchLibrarySyncChanges).toHaveBeenCalledExactlyOnceWith(
      "current.jwt.token",
      "1",
      "2",
    );
    expect(mocks.fetchEncryptedLibraryEntries).not.toHaveBeenCalled();
    expect(mocks.fetchEncryptedLibraryFolders).not.toHaveBeenCalled();
    expect(mocks.fetchEncryptedLibraryTags).not.toHaveBeenCalled();
    expect(mocks.applyLibraryContentCacheDelta).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        revision: "2",
        upserts: expect.objectContaining({
          trash: [
            expect.objectContaining({
              id: trashId,
              user_id: "user-1",
              title: "decrypted:enc:title",
              url: "decrypted:enc:url",
            }),
          ],
        }),
      }),
    );
  });

  it("uses the selected quote as a decrypted highlight Trash preview", async () => {
    const trashId = "11111111-1111-4111-8111-111111111111";
    mocks.getLibraryContentCacheMeta.mockResolvedValue({
      key: "content-sync:user-1",
      revision: "1",
      lastSyncedAt: "2026-08-20T09:00:00.000Z",
    });
    mocks.fetchLibrarySyncStatus.mockResolvedValue({ revision: "2", deltaFloor: "0" });
    mocks.fetchLibrarySyncChanges.mockResolvedValue([{
      resourceType: "trash",
      resourceId: trashId,
      revision: "2",
      operation: "upsert",
    }]);
    mocks.fetchTrashItems.mockResolvedValue([{
      id: trashId,
      resourceId: "22222222-2222-4222-8222-222222222222",
      resourceType: "highlight",
      encryptedTitle: "enc:quote",
      encryptedUrl: null,
      deletedAt: "2026-08-20T10:00:00.000Z",
      expiresAt: "2026-09-19T10:00:00.000Z",
    }]);

    await syncLibraryContentToLocalCache(
      "user-1",
      "current.jwt.token",
      async () => JSON.stringify({ exact: "Selected private text", prefix: "", suffix: "" }),
    );

    expect(mocks.applyLibraryContentCacheDelta).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        upserts: expect.objectContaining({
          trash: [expect.objectContaining({
            resourceType: "highlight",
            title: "Selected private text",
            url: null,
          })],
        }),
      }),
    );
  });

  it("resolves changed entry ciphertext through the API and decrypts it locally", async () => {
    const entryId = "55555555-5555-4555-8555-555555555555";
    mocks.getLibraryContentCacheMeta.mockResolvedValue({
      key: "content-sync:user-1",
      revision: "2",
      lastSyncedAt: "2026-08-20T09:00:00.000Z",
    });
    mocks.fetchLibrarySyncStatus.mockResolvedValue({
      revision: "3",
      deltaFloor: "0",
    });
    mocks.fetchLibrarySyncChanges.mockResolvedValue([
      {
        resourceType: "entry",
        resourceId: entryId,
        revision: "3",
        operation: "upsert",
      },
    ]);
    mocks.fetchEncryptedLibraryEntries.mockResolvedValue([
      {
        id: entryId,
        kind: "note",
        encryptedTitle: "enc:title",
        encryptedContent: "enc:content",
        isCompleted: false,
        completedAt: null,
        dueDate: null,
        createdAt: "2026-08-20T09:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z",
        folder: null,
        tags: [],
      },
    ]);

    const decryptField = vi.fn(async (value: string) => value === "enc:content"
      ? '<h2>Writing</h2><p><mark>Keep this</mark><script>bad()</script></p>'
      : `decrypted:${value}`);
    await syncLibraryContentToLocalCache(
      "user-1",
      "current.jwt.token",
      decryptField,
    );

    expect(mocks.fetchEncryptedLibraryEntries).toHaveBeenCalledExactlyOnceWith(
      "current.jwt.token",
      [entryId],
    );
    expect(mocks.applyLibraryContentCacheDelta).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        upserts: expect.objectContaining({
          entries: [
            expect.objectContaining({
              id: entryId,
              user_id: "user-1",
              title: "decrypted:enc:title",
              content: '<h2>Writing</h2><p><mark>Keep this</mark></p>',
            }),
          ],
        }),
      }),
    );
    expect(decryptField).toHaveBeenCalledWith("enc:content");
  });
});
