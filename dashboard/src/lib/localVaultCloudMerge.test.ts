import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLocalVaultMergeArchive,
  clearLocalVaultCloudMerge,
  inspectLocalVaultCloudDestination,
  markLocalVaultCloudMergeAdopting,
  markLocalVaultCloudMergeCompleted,
  readLocalVaultCloudMerge,
  startLocalVaultCloudMerge,
} from "./localVaultCloudMerge";
import { encryptField, importRawKey, VERIFY_CONSTANT } from "./encryption";
import { IDBFactory } from "fake-indexeddb";
import {
  addLocalListItem,
  createLocalBookmark,
  createLocalEntry,
  createLocalList,
} from "./localVault";

const mocks = vi.hoisted(() => ({
  fetchVerifier: vi.fn(),
  probe: vi.fn(),
}));

vi.mock("./encryptionMetadataApi", () => ({
  fetchEncryptionVerifier: mocks.fetchVerifier,
}));

vi.mock("./encryptionDataProbe", () => ({
  probeEncryptedData: mocks.probe,
}));

const sourceVaultId = "11111111-1111-4111-8111-111111111111";

describe("local vault cloud merge intent", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: new IDBFactory(),
    });
    localStorage.clear();
    mocks.fetchVerifier.mockReset().mockResolvedValue(null);
    mocks.probe.mockReset().mockResolvedValue("empty");
  });

  it("persists a bounded explicit account-switch intent", () => {
    const intent = startLocalVaultCloudMerge(sourceVaultId);
    expect(readLocalVaultCloudMerge()).toEqual(intent);
    clearLocalVaultCloudMerge();
    expect(readLocalVaultCloudMerge()).toBeNull();
  });

  it("persists key adoption before the empty-account migration starts", () => {
    const intent = startLocalVaultCloudMerge(sourceVaultId);
    expect(markLocalVaultCloudMergeAdopting(intent).strategy).toBe(
      "adopt-local-key",
    );
    expect(readLocalVaultCloudMerge()?.strategy).toBe("adopt-local-key");
  });

  it("persists completed adoption so a dashboard remount keeps the success state", () => {
    const intent = markLocalVaultCloudMergeAdopting(
      startLocalVaultCloudMerge(sourceVaultId),
    );
    expect(markLocalVaultCloudMergeCompleted(intent, true)).toMatchObject({
      strategy: "adopt-local-key",
      completed: true,
      adoptedLocalKey: true,
    });
    expect(readLocalVaultCloudMerge()).toMatchObject({
      completed: true,
      adoptedLocalKey: true,
    });
  });

  it("rejects invalid and expired intents", () => {
    expect(() => startLocalVaultCloudMerge("not-a-vault")).toThrow("invalid");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00.000Z"));
    startLocalVaultCloudMerge(sourceVaultId);
    vi.setSystemTime(new Date("2026-09-03T12:00:01.000Z"));
    expect(readLocalVaultCloudMerge()).toBeNull();
    vi.useRealTimers();
  });

  it("classifies an empty destination without creating a cloud key", async () => {
    const sourceKey = await importRawKey("a".repeat(32));

    await expect(
      inspectLocalVaultCloudDestination(sourceKey, "current.jwt.token"),
    ).resolves.toBe("empty");

    expect(mocks.probe).toHaveBeenCalledWith(
      sourceKey,
      "current.jwt.token",
    );
  });

  it("recognizes when the cloud verifier already uses the local key", async () => {
    const sourceKey = await importRawKey("a".repeat(32));
    mocks.fetchVerifier.mockResolvedValue(
      await encryptField(VERIFY_CONSTANT, sourceKey),
    );

    await expect(
      inspectLocalVaultCloudDestination(sourceKey, "current.jwt.token"),
    ).resolves.toBe("same-key");
    expect(mocks.probe).not.toHaveBeenCalled();
  });

  it("does not mistake a different encrypted vault for an empty account", async () => {
    const sourceKey = await importRawKey("a".repeat(32));
    const destinationKey = await importRawKey("b".repeat(32));
    mocks.fetchVerifier.mockResolvedValue(
      await encryptField(VERIFY_CONSTANT, destinationKey),
    );

    await expect(
      inspectLocalVaultCloudDestination(sourceKey, "current.jwt.token"),
    ).resolves.toBe("different-key");
  });

  it("recognizes legacy same-key data that has no verifier", async () => {
    const sourceKey = await importRawKey("a".repeat(32));
    mocks.probe.mockResolvedValue("matches");

    await expect(
      inspectLocalVaultCloudDestination(sourceKey, "current.jwt.token"),
    ).resolves.toBe("same-key-without-verifier");
  });

  it("includes the complete encrypted local library in the cloud merge archive", async () => {
    const key = await importRawKey("a".repeat(32));
    const bookmarkId = await createLocalBookmark(sourceVaultId, {
      encryptedTitle: await encryptField("Bookmark", key),
      encryptedUrl: await encryptField("https://favlock.app", key),
      folderId: null,
      existingTagIds: [],
      newEncryptedTagNames: [],
    });
    await createLocalEntry(sourceVaultId, "note", {
      title: await encryptField("Document", key),
      content: await encryptField("Private document", key),
      folderId: null,
      existingTagIds: [],
      newEncryptedTagNames: [],
    });
    await createLocalEntry(sourceVaultId, "todo", {
      title: await encryptField("Task", key),
      content: await encryptField("Private task", key),
      folderId: null,
      existingTagIds: [],
      newEncryptedTagNames: [],
    });
    await createLocalEntry(sourceVaultId, "read", {
      title: await encryptField("Article", key),
      content: await encryptField("Private article", key),
      folderId: null,
      existingTagIds: [],
      newEncryptedTagNames: [],
    });
    const listId = await createLocalList(
      sourceVaultId,
      await encryptField("Queue", key),
    );
    await addLocalListItem(sourceVaultId, listId, bookmarkId);

    const archive = await buildLocalVaultMergeArchive(sourceVaultId, key);
    expect(archive.selection).toEqual({
      bookmarks: true,
      notes: true,
      todos: true,
      readspace: true,
    });
    expect(archive.data.bookmarks).toHaveLength(1);
    expect(archive.data.lists).toHaveLength(1);
    expect(archive.data.notes).toHaveLength(1);
    expect(archive.data.todos).toHaveLength(1);
    expect(archive.data.readspace).toHaveLength(1);
  });
});
