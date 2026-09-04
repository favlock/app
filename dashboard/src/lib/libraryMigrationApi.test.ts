import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./favLockAuth", () => import("../test/requestSessionAuthMock"));
import type { FavLockExport } from "./dataExport";
import {
  batchEncryptedMigrationItems,
  migrateFavLockArchive,
  prepareEncryptedMigrationItems,
} from "./libraryMigrationApi";
import { decryptFieldStrict, importRawKey, VERIFY_CONSTANT } from "./encryption";

const timestamp = "2026-08-25T09:00:00.000Z";
const archive: FavLockExport = {
  format: "favlock-export", version: 2, exportedAt: timestamp, encrypted: false,
  selection: { bookmarks: true, notes: true, todos: true, readspace: true, highlights: true },
  data: {
    collections: [{ id: "10000000-0000-4000-8000-000000000001", name: "Work", color: "BLUE", parentId: null, sortOrder: 0, createdAt: timestamp }],
    tags: [{ id: "20000000-0000-4000-8000-000000000001", name: "Ideas", createdAt: timestamp }],
    bookmarks: [{ id: "30000000-0000-4000-8000-000000000001", title: "Example", url: "https://example.com/", collectionIds: ["10000000-0000-4000-8000-000000000001"], tagIds: ["20000000-0000-4000-8000-000000000001"], isFavorite: true, favoritedAt: timestamp, createdAt: timestamp }],
    lists: [{ id: "40000000-0000-4000-8000-000000000001", name: "Watch later", createdAt: timestamp, updatedAt: timestamp, items: [{ bookmarkId: "30000000-0000-4000-8000-000000000001", position: 0, completedAt: timestamp, createdAt: timestamp }] }],
    notes: [], todos: [], readspace: [],
    highlights: [{
      id: "50000000-0000-4000-8000-000000000001",
      bookmarkId: "30000000-0000-4000-8000-000000000001",
      entryId: null,
      payload: {
        version: 1,
        quote: { exact: "Important quote", prefix: "Before", suffix: "After" },
        position: null,
        dom: null,
        color: "pink",
        note: "Private annotation",
        capturedAt: timestamp,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("encrypted library migration client", () => {
  it("encrypts every protected value with the supplied migration key", async () => {
    const encrypt = vi.fn(async (value: string) => `migrated:${value}`);
    const items = await prepareEncryptedMigrationItems(archive, encrypt);
    expect(items).toMatchObject([
      { type: "collection", encryptedName: "migrated:Work" },
      { type: "tag", encryptedName: "migrated:Ideas" },
      { type: "list", encryptedName: "migrated:Watch later" },
      { type: "bookmark", encryptedTitle: "migrated:Example", encryptedUrl: "migrated:https://example.com/" },
      { type: "highlight", encryptedQuote: expect.stringContaining("Important quote"), encryptedAnnotation: "migrated:Private annotation", color: "pink" },
      { type: "listItem", position: 0, completedAt: timestamp },
    ]);
    expect(JSON.stringify(items)).not.toContain('"name":"Work"');
    expect(items.map(({ id }) => id)).not.toContain(
      archive.data.collections[0].id,
    );
    expect(items[3]).toMatchObject({
      collectionIds: [items[0].id],
      tagIds: [items[1].id],
    });
    expect(items[4]).toMatchObject({
      bookmarkId: items[3].id,
    });
    expect(items[5]).toMatchObject({
      listId: items[2].id,
      bookmarkId: items[3].id,
    });
  });

  it("keeps batches within the fixed item bound", () => {
    const item = { ...batchEncryptedMigrationItems([
      { type: "tag", id: "20000000-0000-4000-8000-000000000001", encryptedName: "enc", createdAt: timestamp },
    ])[0][0] };
    const items = Array.from({ length: 1001 }, (_, index) => ({
      ...item,
      id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    expect(batchEncryptedMigrationItems(items).map((batch) => batch.length)).toEqual([500, 500, 1]);
  });

  it("remaps an article highlight to the migrated Readspace entry", async () => {
    const entryId = "70000000-0000-4000-8000-000000000001";
    const migratedEntryId = "71000000-0000-4000-8000-000000000001";
    const migratedHighlightId = "72000000-0000-4000-8000-000000000001";
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce(migratedEntryId)
      .mockReturnValueOnce(migratedHighlightId);
    const items = await prepareEncryptedMigrationItems({
      format: "favlock-export",
      version: 2,
      exportedAt: timestamp,
      encrypted: false,
      selection: { bookmarks: false, notes: false, todos: false, readspace: true, highlights: true },
      data: {
        collections: [],
        tags: [],
        readspace: [{
          id: entryId,
          title: "Saved article",
          content: "Article body",
          collectionId: null,
          tagIds: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        }],
        highlights: [{
          id: "73000000-0000-4000-8000-000000000001",
          bookmarkId: null,
          entryId,
          payload: {
            version: 1,
            quote: { exact: "Article quote", prefix: "", suffix: "" },
            position: null,
            dom: null,
            color: "blue",
            note: "",
            capturedAt: timestamp,
          },
          createdAt: timestamp,
          updatedAt: timestamp,
        }],
      },
    }, async (value) => `enc:${value}`);

    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "entry", id: migratedEntryId, kind: "read" }),
      expect.objectContaining({
        type: "highlight",
        id: migratedHighlightId,
        bookmarkId: null,
        entryId: migratedEntryId,
      }),
    ]));
  });

  it("stages then atomically completes through the API", async () => {
    const migrationId = "90000000-0000-4000-8000-000000000001";
    const generatedIds = [
      "91000000-0000-4000-8000-000000000001",
      "92000000-0000-4000-8000-000000000001",
      "93000000-0000-4000-8000-000000000001",
      "94000000-0000-4000-8000-000000000001",
      "95000000-0000-4000-8000-000000000001",
      "96000000-0000-4000-8000-000000000001",
      migrationId,
    ];
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => generatedIds.shift() as `${string}-${string}-${string}-${string}-${string}`,
    );
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { migrationId, status: "staging" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { migrationId, status: "completed" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const recoveryKey = await importRawKey("ABCD1234EFGH5678IJKL9012MNOP3456");
    await migrateFavLockArchive(archive, "token", recoveryKey);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain(`/v1/account/migrations/${migrationId}/batches/0`);
    expect(fetchMock.mock.calls[2][0]).toContain(`/v1/account/migrations/${migrationId}/complete`);
    const completionBody = JSON.parse(
      fetchMock.mock.calls[2][1]?.body as string,
    ) as { verifier: string };
    await expect(
      decryptFieldStrict(completionBody.verifier, recoveryKey),
    ).resolves.toBe(VERIFY_CONSTANT);
  });
});
