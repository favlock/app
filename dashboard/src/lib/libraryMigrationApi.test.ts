import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./favLockAuth", () => import("../test/requestSessionAuthMock"));
import type { FavLockExport } from "./dataExport";
import {
  batchEncryptedMigrationItems,
  mergeFavLockArchive,
  migrateFavLockArchive,
  prepareEncryptedMigrationItems,
} from "./libraryMigrationApi";
import { decryptFieldStrict, importRawKey, VERIFY_CONSTANT } from "./encryption";

const timestamp = "2026-08-25T09:00:00.000Z";
const archive: FavLockExport = {
  format: "favlock-export", version: 2, exportedAt: timestamp, encrypted: false,
  selection: { bookmarks: true, notes: true, todos: true, readspace: true },
  data: {
    collections: [{ id: "10000000-0000-4000-8000-000000000001", name: "Work", color: "BLUE", parentId: null, sortOrder: 0, createdAt: timestamp }],
    tags: [{ id: "20000000-0000-4000-8000-000000000001", name: "Ideas", createdAt: timestamp }],
    bookmarks: [{ id: "30000000-0000-4000-8000-000000000001", title: "Example", url: "https://example.com/", collectionIds: ["10000000-0000-4000-8000-000000000001"], tagIds: ["20000000-0000-4000-8000-000000000001"], isFavorite: true, favoritedAt: timestamp, createdAt: timestamp }],
    lists: [{ id: "40000000-0000-4000-8000-000000000001", name: "Watch later", createdAt: timestamp, updatedAt: timestamp, items: [{ bookmarkId: "30000000-0000-4000-8000-000000000001", position: 0, completedAt: timestamp, createdAt: timestamp }] }],
    notes: [], todos: [], readspace: [],
  },
};

const completeArchive: FavLockExport = {
  ...archive,
  data: {
    ...archive.data,
    notes: [{
      id: "50000000-0000-4000-8000-000000000001",
      title: "Private note",
      content: "Note body",
      collectionId: "10000000-0000-4000-8000-000000000001",
      tagIds: ["20000000-0000-4000-8000-000000000001"],
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    todos: [{
      id: "60000000-0000-4000-8000-000000000001",
      title: "Private task",
      content: "Task body",
      collectionId: null,
      tagIds: [],
      isCompleted: true,
      completedAt: timestamp,
      dueDate: "2026-09-03",
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    readspace: [{
      id: "70000000-0000-4000-8000-000000000001",
      title: "Private article",
      content: "Article body",
      collectionId: null,
      tagIds: [],
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

  it("stages then atomically completes through the API", async () => {
    const migrationId = "90000000-0000-4000-8000-000000000001";
    const generatedIds = [
      "91000000-0000-4000-8000-000000000001",
      "92000000-0000-4000-8000-000000000001",
      "93000000-0000-4000-8000-000000000001",
      "94000000-0000-4000-8000-000000000001",
      "95000000-0000-4000-8000-000000000001",
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

  it("merges the complete local library without replacing the destination verifier", async () => {
    const migrationId = "90000000-0000-4000-8000-000000000002";
    const generatedIds = [
      "91000000-0000-4000-8000-000000000002",
      "92000000-0000-4000-8000-000000000002",
      "93000000-0000-4000-8000-000000000002",
      "94000000-0000-4000-8000-000000000002",
      "95000000-0000-4000-8000-000000000002",
      "96000000-0000-4000-8000-000000000002",
      "97000000-0000-4000-8000-000000000002",
      "98000000-0000-4000-8000-000000000002",
    ];
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => generatedIds.shift() as `${string}-${string}-${string}-${string}-${string}`,
    );
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { migrationId, status: "staging" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { migrationId, status: "completed" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const destinationKey = await importRawKey("ABCD1234EFGH5678IJKL9012MNOP3456");
    await mergeFavLockArchive(
      completeArchive,
      "token",
      destinationKey,
      undefined,
      migrationId,
    );

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
      migrationId,
      mode: "merge_existing",
    });
    expect(fetchMock.mock.calls[2][0]).toContain(
      `/v1/account/migrations/${migrationId}/merge`,
    );
    expect(fetchMock.mock.calls[2][1]?.body).toBe("{}");
    const stagedItems = JSON.parse(
      fetchMock.mock.calls[1][1]?.body as string,
    ).items as Array<Record<string, unknown>>;
    expect(stagedItems.map((item) => item.type)).toEqual([
      "collection",
      "tag",
      "list",
      "bookmark",
      "entry",
      "entry",
      "entry",
      "listItem",
    ]);
    expect(stagedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "entry", kind: "note" }),
      expect.objectContaining({ type: "entry", kind: "todo", isCompleted: true }),
      expect.objectContaining({ type: "entry", kind: "read" }),
      expect.objectContaining({ type: "listItem" }),
    ]));
    expect(JSON.stringify(stagedItems)).not.toContain("Private note");
    expect(JSON.stringify(stagedItems)).not.toContain("Task body");
    expect(JSON.stringify(stagedItems)).not.toContain("Article body");
  });

  it("confirms a previously completed merge without uploading duplicates", async () => {
    const localArchive: FavLockExport = {
      ...archive,
      data: { ...archive.data, lists: [] },
    };
    const migrationId = "90000000-0000-4000-8000-000000000003";
    const generatedIds = [
      "91000000-0000-4000-8000-000000000003",
      "92000000-0000-4000-8000-000000000003",
      "93000000-0000-4000-8000-000000000003",
    ];
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => generatedIds.shift() as `${string}-${string}-${string}-${string}-${string}`,
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { migrationId, status: "completed" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const destinationKey = await importRawKey("ABCD1234EFGH5678IJKL9012MNOP3456");
    await mergeFavLockArchive(
      localArchive,
      "token",
      destinationKey,
      undefined,
      migrationId,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reuses a local-vault migration id when adopting its key", async () => {
    const migrationId = "90000000-0000-4000-8000-000000000004";
    const generatedIds = [
      "91000000-0000-4000-8000-000000000004",
      "92000000-0000-4000-8000-000000000004",
      "93000000-0000-4000-8000-000000000004",
      "94000000-0000-4000-8000-000000000004",
      "95000000-0000-4000-8000-000000000004",
    ];
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => generatedIds.shift() as `${string}-${string}-${string}-${string}-${string}`,
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { migrationId, status: "completed" } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const localKey = await importRawKey("ABCD1234EFGH5678IJKL9012MNOP3456");
    await migrateFavLockArchive(
      archive,
      "token",
      localKey,
      undefined,
      migrationId,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
      migrationId,
      expectedBatchCount: 1,
    });
  });
});
