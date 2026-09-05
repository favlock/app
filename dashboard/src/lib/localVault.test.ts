import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { encryptField, importRawKey } from "./encryption";
import type { FavLockExport } from "./dataExport";
import {
  createLocalBookmark,
  createLocalEntry,
  createLocalExtensionBookmark,
  createLocalFolder,
  createLocalList,
  addLocalListItem,
  deleteLocalEntry,
  deleteLocalFolder,
  favoriteLocalBookmark,
  importLocalBookmarks,
  readLocalBookmarks,
  readLocalEncryptedPreview,
  readLocalExtensionProjection,
  readLocalEntries,
  readLocalFolders,
  readLocalLists,
  readLocalResourceUsage,
  readLocalTags,
  restoreLocalVaultFromExport,
} from "./localVault";

const backup: FavLockExport = {
  format: "favlock-export",
  version: 2,
  exportedAt: "2026-09-02T10:00:00.000Z",
  encrypted: false,
  selection: {
    bookmarks: true,
    notes: false,
    todos: false,
    readspace: false,
  },
  data: {
    collections: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Research",
        color: null,
        parentId: null,
        sortOrder: 0,
        createdAt: "2026-09-01T10:00:00.000Z",
      },
    ],
    tags: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Private",
        createdAt: "2026-09-01T10:00:00.000Z",
      },
    ],
    lists: [],
    bookmarks: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        title: "FavLock",
        url: "https://favlock.app",
        collectionIds: ["11111111-1111-4111-8111-111111111111"],
        tagIds: ["22222222-2222-4222-8222-222222222222"],
        isFavorite: true,
        favoritedAt: "2026-09-02T10:00:00.000Z",
        createdAt: "2026-09-01T10:00:00.000Z",
      },
    ],
  },
};

describe("local encrypted vault", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: new IDBFactory(),
    });
  });

  it("round-trips encrypted bookmarks, Collections, and Tags", async () => {
    const vaultId = "11111111-1111-4111-8111-111111111111";
    const key = await importRawKey("12345678901234567890123456789012");
    const folder = await createLocalFolder(vaultId, {
      encryptedName: await encryptField("Research", key),
      color: null,
      parentId: null,
      sortOrder: 0,
    });

    await createLocalBookmark(vaultId, {
      encryptedTitle: await encryptField("FavLock", key),
      encryptedUrl: await encryptField("https://favlock.app", key),
      folderId: folder.id,
      existingTagIds: [],
      newEncryptedTagNames: [await encryptField("Private", key)],
    });

    await expect(readLocalFolders(vaultId, key)).resolves.toMatchObject([
      { id: folder.id, name: "Research" },
    ]);
    await expect(readLocalTags(vaultId, key)).resolves.toMatchObject([
      { name: "Private" },
    ]);
    await expect(readLocalBookmarks(vaultId, key)).resolves.toMatchObject([
      {
        title: "FavLock",
        url: "https://favlock.app",
        folders: [{ name: "Research" }],
        tags: [{ name: "Private" }],
      },
    ]);

    const preview = await readLocalEncryptedPreview(vaultId);
    expect(preview).toMatchObject([
      {
        kind: "Bookmark",
        protectedFields: [
          { label: "title", ciphertext: expect.stringMatching(/^enc:/) },
          { label: "url", ciphertext: expect.stringMatching(/^enc:/) },
        ],
      },
      {
        kind: "Collection",
        protectedFields: [
          { label: "name", ciphertext: expect.stringMatching(/^enc:/) },
        ],
      },
      {
        kind: "Tag",
        protectedFields: [
          { label: "name", ciphertext: expect.stringMatching(/^enc:/) },
        ],
      },
    ]);
    expect(JSON.stringify(preview)).not.toContain("FavLock");
    expect(JSON.stringify(preview)).not.toContain("https://favlock.app");
  });

  it("keeps vaults isolated and unfiles bookmarks when a Collection is deleted", async () => {
    const key = await importRawKey("12345678901234567890123456789012");
    const folder = await createLocalFolder("vault-a", {
      encryptedName: await encryptField("A", key),
      color: null,
      parentId: null,
      sortOrder: 0,
    });
    await createLocalBookmark("vault-a", {
      encryptedTitle: await encryptField("A bookmark", key),
      encryptedUrl: await encryptField("https://a.example", key),
      folderId: folder.id,
      existingTagIds: [],
      newEncryptedTagNames: [],
    });

    await deleteLocalFolder("vault-a", folder.id);

    await expect(readLocalBookmarks("vault-a", key)).resolves.toMatchObject([
      { title: "A bookmark", folders: [] },
    ]);
    await expect(readLocalBookmarks("vault-b", key)).resolves.toEqual([]);
  });

  it("restores a validated backup into an empty vault and encrypts every protected field", async () => {
    const key = await importRawKey("12345678901234567890123456789012");

    await restoreLocalVaultFromExport("restored-vault", backup, key);

    await expect(readLocalBookmarks("restored-vault", key)).resolves.toMatchObject([
      {
        title: "FavLock",
        url: "https://favlock.app",
        is_favorite: true,
        folders: [{ name: "Research" }],
        tags: [{ name: "Private" }],
      },
    ]);
    const preview = await readLocalEncryptedPreview("restored-vault");
    expect(JSON.stringify(preview)).not.toContain("FavLock");
    expect(JSON.stringify(preview)).not.toContain("https://favlock.app");
  });

  it("refuses to merge a backup into a non-empty local vault", async () => {
    const key = await importRawKey("12345678901234567890123456789012");
    await restoreLocalVaultFromExport("restored-vault", backup, key);

    await expect(
      restoreLocalVaultFromExport("restored-vault", backup, key),
    ).rejects.toThrow("only for an empty local vault");
    await expect(readLocalBookmarks("restored-vault", key)).resolves.toHaveLength(1);
  });

  it("restores Lists and encrypted entry categories", async () => {
    const key = await importRawKey("12345678901234567890123456789012");
    const archiveWithLibrary: FavLockExport = {
      ...backup,
      selection: { bookmarks: true, notes: true, todos: true, readspace: true },
      data: {
        ...backup.data,
        lists: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            name: "Queue",
            createdAt: "2026-09-01T10:00:00.000Z",
            updatedAt: "2026-09-01T10:00:00.000Z",
            items: [{
              bookmarkId: "33333333-3333-4333-8333-333333333333",
              position: 0,
              completedAt: null,
              createdAt: "2026-09-01T10:00:00.000Z",
            }],
          },
        ],
        notes: [{
          id: "55555555-5555-4555-8555-555555555555",
          title: "Private document",
          content: "Secret body",
          collectionId: "11111111-1111-4111-8111-111111111111",
          tagIds: ["22222222-2222-4222-8222-222222222222"],
          createdAt: "2026-09-01T10:00:00.000Z",
          updatedAt: "2026-09-02T10:00:00.000Z",
        }],
        todos: [{
          id: "66666666-6666-4666-8666-666666666666",
          title: "Private task",
          content: "Do it",
          collectionId: null,
          tagIds: [],
          isCompleted: true,
          completedAt: "2026-09-02T10:00:00.000Z",
          dueDate: "2026-09-03",
          createdAt: "2026-09-01T10:00:00.000Z",
          updatedAt: "2026-09-02T10:00:00.000Z",
        }],
        readspace: [{
          id: "77777777-7777-4777-8777-777777777777",
          title: "Private article",
          content: "Captured content",
          collectionId: null,
          tagIds: [],
          createdAt: "2026-09-01T10:00:00.000Z",
          updatedAt: "2026-09-02T10:00:00.000Z",
        }],
      },
    };

    await restoreLocalVaultFromExport("restored-vault", archiveWithLibrary, key);
    await expect(readLocalLists("restored-vault", key)).resolves.toMatchObject([
      { name: "Queue", items: [{ bookmark: { title: "FavLock" } }] },
    ]);
    await expect(readLocalEntries("restored-vault", key)).resolves.toEqual(expect.arrayContaining([
      { kind: "note", title: "Private document", content: "Secret body" },
      { kind: "todo", title: "Private task", is_completed: true, due_date: "2026-09-03" },
      { kind: "read", title: "Private article", content: "Captured content" },
    ].map((entry) => expect.objectContaining(entry))));
    const preview = await readLocalEncryptedPreview("restored-vault");
    expect(JSON.stringify(preview)).not.toContain("Private document");
    expect(JSON.stringify(preview)).not.toContain("Secret body");
  });

  it("round-trips encrypted local entries and Lists and deletes entries immediately", async () => {
    const vaultId = "local-library";
    const key = await importRawKey("12345678901234567890123456789012");
    const bookmarkId = await createLocalBookmark(vaultId, {
      encryptedTitle: await encryptField("Saved", key),
      encryptedUrl: await encryptField("https://saved.test", key),
      folderId: null,
      existingTagIds: [],
      newEncryptedTagNames: [],
    });
    const noteId = await createLocalEntry(vaultId, "note", {
      title: await encryptField("Document", key),
      content: await encryptField("Private content", key),
      folderId: null,
      existingTagIds: [],
      newEncryptedTagNames: [],
    });
    await createLocalEntry(vaultId, "read", {
      title: await encryptField("Article", key),
      content: await encryptField("Captured content", key),
      folderId: null,
      existingTagIds: [],
      newEncryptedTagNames: [],
    });
    const listId = await createLocalList(vaultId, await encryptField("Read later", key));
    await addLocalListItem(vaultId, listId, bookmarkId);

    await expect(readLocalEntries(vaultId, key)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: noteId,
          kind: "note",
          title: "Document",
          content: "Private content",
        }),
        expect.objectContaining({ kind: "read", title: "Article" }),
      ]),
    );
    await expect(readLocalLists(vaultId, key)).resolves.toMatchObject([
      { id: listId, name: "Read later", items: [{ bookmark: { id: bookmarkId } }] },
    ]);
    await expect(readLocalResourceUsage(vaultId)).resolves.toEqual({
      bookmarks: 1,
      entries: 1,
      readspace: 1,
      collections: 0,
      tags: 0,
      lists: 1,
    });
    await deleteLocalEntry(vaultId, noteId);
    await expect(readLocalEntries(vaultId, key)).resolves.toMatchObject([
      { kind: "read", title: "Article" },
    ]);
  });

  it("commits an encrypted extension bookmark and its new organization atomically", async () => {
    const vaultId = "extension-local-vault";
    const key = await importRawKey("12345678901234567890123456789012");

    await createLocalExtensionBookmark(vaultId, {
      existingBookmarkId: null,
      encryptedTitle: await encryptField("Extension bookmark", key),
      encryptedUrl: await encryptField("https://extension.test", key),
      folderId: null,
      selectedListIds: [],
      existingTagIds: [],
      encryptedNewCollectionName: await encryptField("Extension Collection", key),
      encryptedNewListName: await encryptField("Extension List", key),
      newEncryptedTagNames: [await encryptField("extension-tag", key)],
    });

    await expect(readLocalBookmarks(vaultId, key)).resolves.toMatchObject([
      {
        title: "Extension bookmark",
        folders: [{ name: "Extension Collection" }],
        tags: [{ name: "extension-tag" }],
      },
    ]);
    await expect(readLocalLists(vaultId, key)).resolves.toMatchObject([
      {
        name: "Extension List",
        items: [{ bookmark: { title: "Extension bookmark" } }],
      },
    ]);
    const preview = await readLocalEncryptedPreview(vaultId);
    expect(JSON.stringify(preview)).not.toContain("Extension bookmark");
    const projection = await readLocalExtensionProjection(vaultId);
    expect(projection).toMatchObject({
      version: 1,
      userId: vaultId,
      folders: [{ encryptedName: expect.stringMatching(/^enc:/) }],
      tags: [{ encryptedName: expect.stringMatching(/^enc:/) }],
      lists: [{ encryptedName: expect.stringMatching(/^enc:/) }],
      bookmarks: [{
        encryptedTitle: expect.stringMatching(/^enc:/),
        encryptedUrl: expect.stringMatching(/^enc:/),
        folderId: projection.folders[0]?.id,
        tagIds: [projection.tags[0]?.id],
        listIds: [projection.lists[0]?.id],
      }],
    });
    expect(JSON.stringify(projection)).not.toContain("Extension bookmark");
    expect(JSON.stringify(projection)).not.toContain("https://extension.test");
  });

  it("rolls back the extension handoff when an organization reference is invalid", async () => {
    const vaultId = "extension-invalid-vault";
    const key = await importRawKey("12345678901234567890123456789012");

    await expect(createLocalExtensionBookmark(vaultId, {
      existingBookmarkId: null,
      encryptedTitle: await encryptField("Do not save", key),
      encryptedUrl: await encryptField("https://invalid.test", key),
      folderId: null,
      selectedListIds: ["11111111-1111-4111-8111-111111111111"],
      existingTagIds: [],
      encryptedNewCollectionName: await encryptField("Must roll back", key),
      encryptedNewListName: null,
      newEncryptedTagNames: [await encryptField("must-roll-back", key)],
    })).rejects.toThrow("selected local List");

    await expect(readLocalBookmarks(vaultId, key)).resolves.toEqual([]);
    await expect(readLocalFolders(vaultId, key)).resolves.toEqual([]);
    await expect(readLocalTags(vaultId, key)).resolves.toEqual([]);
  });

  it("updates an existing local extension bookmark without creating a duplicate", async () => {
    const vaultId = "extension-update-vault";
    const key = await importRawKey("12345678901234567890123456789012");
    const bookmarkId = await createLocalExtensionBookmark(vaultId, {
      existingBookmarkId: null,
      encryptedTitle: await encryptField("Original title", key),
      encryptedUrl: await encryptField("https://existing.test", key),
      folderId: null,
      selectedListIds: [],
      existingTagIds: [],
      encryptedNewCollectionName: null,
      encryptedNewListName: null,
      newEncryptedTagNames: [],
    });

    await expect(createLocalExtensionBookmark(vaultId, {
      existingBookmarkId: bookmarkId,
      encryptedTitle: await encryptField("Updated title", key),
      encryptedUrl: await encryptField("https://ignored.test", key),
      folderId: null,
      selectedListIds: [],
      existingTagIds: [],
      encryptedNewCollectionName: null,
      encryptedNewListName: null,
      newEncryptedTagNames: [],
    })).resolves.toBe(bookmarkId);

    await expect(readLocalBookmarks(vaultId, key)).resolves.toMatchObject([{
      id: bookmarkId,
      title: "Updated title",
      url: "https://existing.test",
    }]);
  });

  it("imports bookmarks and Collections atomically with protected fields encrypted", async () => {
    const key = await importRawKey("12345678901234567890123456789012");
    const existingId = await createLocalBookmark("local-import", {
      encryptedTitle: await encryptField("Old title", key),
      encryptedUrl: await encryptField("https://existing.test/", key),
      folderId: null,
      existingTagIds: [],
      newEncryptedTagNames: [await encryptField("Keep me", key)],
    });
    await favoriteLocalBookmark("local-import", existingId, true);

    await expect(
      importLocalBookmarks(
        "local-import",
        [
          {
            title: "Updated title",
            url: "https://existing.test/",
            folderPath: ["Imported"],
            overwriteBookmarkId: existingId,
          },
          {
            title: "New bookmark",
            url: "https://new.test/",
            folderPath: ["Imported", "Nested"],
          },
        ],
        key,
      ),
    ).resolves.toEqual({ added: 1, overwritten: 1, collectionsCreated: 2 });

    const bookmarks = await readLocalBookmarks("local-import", key);
    expect(bookmarks).toHaveLength(2);
    expect(bookmarks.find((item) => item.id === existingId)).toMatchObject({
      title: "Updated title",
      is_favorite: true,
      tags: [{ name: "Keep me" }],
      folders: [{ name: "Imported" }],
    });
    expect(bookmarks.find((item) => item.title === "New bookmark")).toMatchObject({
      folders: [{ name: "Nested" }],
    });
    const preview = await readLocalEncryptedPreview("local-import");
    expect(JSON.stringify(preview)).not.toContain("Updated title");
    expect(JSON.stringify(preview)).not.toContain("https://new.test/");
  });

  it("rolls back the whole import if a reviewed duplicate changed", async () => {
    const key = await importRawKey("12345678901234567890123456789012");

    await expect(
      importLocalBookmarks(
        "local-import",
        [
          {
            title: "Would be added",
            url: "https://added.test/",
            folderPath: ["Would be created"],
          },
          {
            title: "Missing duplicate",
            url: "https://missing.test/",
            folderPath: [],
            overwriteBookmarkId: "11111111-1111-4111-8111-111111111111",
          },
        ],
        key,
      ),
    ).rejects.toThrow("changed before the import completed");

    await expect(readLocalBookmarks("local-import", key)).resolves.toEqual([]);
    await expect(readLocalFolders("local-import", key)).resolves.toEqual([]);
  });

  it("enforces the local bookmark allowance again inside the write transaction", async () => {
    const key = await importRawKey("12345678901234567890123456789012");
    const items = Array.from({ length: 250 }, (_, index) => ({
      title: `Bookmark ${index}`,
      url: `https://limit.test/${index}`,
      folderPath: [],
    }));
    await importLocalBookmarks("local-import", items, key);

    await expect(
      importLocalBookmarks(
        "local-import",
        [{ title: "Too many", url: "https://limit.test/overflow", folderPath: [] }],
        key,
      ),
    ).rejects.toThrow("250-bookmark local limit");
    await expect(readLocalBookmarks("local-import", key)).resolves.toHaveLength(250);
  });
});
