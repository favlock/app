import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./favLockAuth", () => import("../test/requestSessionAuthMock"));
import {
  fetchEncryptedLibraryBookmarks,
  fetchEncryptedLibraryBookmarkSample,
  fetchEncryptedLibraryEntries,
  fetchEncryptedLibraryEntrySample,
  fetchEncryptedLibraryFolderSample,
  fetchEncryptedLibraryFolders,
  fetchEncryptedLibraryTagSample,
  fetchEncryptedLibraryTags,
} from "./libraryContentApi";

const entryId = "11111111-1111-4111-8111-111111111111";
const secondEntryId = "22222222-2222-4222-8222-222222222222";
const folderId = "33333333-3333-4333-8333-333333333333";
const tagId = "44444444-4444-4444-8444-444444444444";
const bookmarkId = "55555555-5555-4555-8555-555555555555";

const folder = {
  id: folderId,
  encryptedName: "enc:folder",
  color: "PURPLE",
  parentId: null,
  sortOrder: 0,
  createdAt: "2026-08-20T09:00:00.000Z",
};

const tag = {
  id: tagId,
  encryptedName: "enc:tag",
  createdAt: "2026-08-20T09:00:00.000Z",
};

const entry = {
  id: entryId,
  kind: "note",
  encryptedTitle: "enc:title",
  encryptedContent: "enc:content",
  isCompleted: false,
  completedAt: null,
  dueDate: null,
  createdAt: "2026-08-20T09:00:00.000Z",
  updatedAt: "2026-08-20T10:00:00.000Z",
  folder,
  tags: [tag],
};

const bookmark = {
  id: bookmarkId,
  encryptedTitle: "enc:bookmark-title",
  encryptedUrl: "enc:bookmark-url",
  isFavorite: true,
  favoritedAt: "2026-08-20T10:30:00.000Z",
  createdAt: "2026-08-20T09:00:00.000Z",
  folders: [folder],
  tags: [tag],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("library content API client", () => {
  it("paginates encrypted entries through the FavLock API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { items: [entry], nextCursor: entryId },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              items: [{ ...entry, id: secondEntryId }],
              nextCursor: null,
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchEncryptedLibraryEntries("current.jwt.token"),
    ).resolves.toHaveLength(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://api.favlock.example/v1/library/entries?limit=20&cursor=${entryId}`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer current.jwt.token",
        }),
      }),
    );
  });

  it("resolves only requested folder identifiers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { items: [folder], nextCursor: null } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchEncryptedLibraryFolders("current.jwt.token", [folderId]),
    ).resolves.toEqual([folder]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/library/folders/resolve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ids: [folderId] }),
      }),
    );
  });

  it("resolves only requested bookmark identifiers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { items: [bookmark], nextCursor: null } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchEncryptedLibraryBookmarks("current.jwt.token", [bookmarkId]),
    ).resolves.toEqual([bookmark]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/library/bookmarks/resolve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ids: [bookmarkId] }),
      }),
    );
  });

  it("deduplicates requested identifiers and skips an empty resolution", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { items: [tag], nextCursor: null } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchEncryptedLibraryTags("current.jwt.token", [tagId, tagId]),
    ).resolves.toEqual([tag]);
    await expect(
      fetchEncryptedLibraryTags("current.jwt.token", []),
    ).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("loads bounded encryption samples through existing library routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { items: [folder], nextCursor: null } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { items: [tag], nextCursor: null } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { items: [entry], nextCursor: null } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { items: [bookmark], nextCursor: null } }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchEncryptedLibraryFolderSample("current.jwt.token"),
    ).resolves.toEqual([folder]);
    await expect(
      fetchEncryptedLibraryTagSample("current.jwt.token"),
    ).resolves.toEqual([tag]);
    await expect(
      fetchEncryptedLibraryEntrySample("current.jwt.token"),
    ).resolves.toEqual([entry]);
    await expect(
      fetchEncryptedLibraryBookmarkSample("current.jwt.token"),
    ).resolves.toEqual([bookmark]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.favlock.example/v1/library/folders?limit=10",
      "https://api.favlock.example/v1/library/tags?limit=10",
      "https://api.favlock.example/v1/library/entries?limit=10",
      "https://api.favlock.example/v1/library/bookmarks?limit=10",
    ]);
  });

  it.each([
    { ...bookmark, isFavorite: "yes" },
    { ...bookmark, favoritedAt: "not-a-timestamp" },
    { ...bookmark, folders: [folder, folder] },
    { ...bookmark, tags: Array.from({ length: 11 }, () => tag) },
  ])("fails closed for malformed encrypted bookmarks %#", async (item) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: { items: [item], nextCursor: null } }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      fetchEncryptedLibraryBookmarks("current.jwt.token"),
    ).rejects.toThrow("Could not load your encrypted library");
  });

  it.each([
    { ...entry, kind: "database-kind" },
    { ...entry, isCompleted: true, completedAt: null },
    { ...entry, folder: { ...folder, color: "database-color" } },
    { ...entry, tags: Array.from({ length: 11 }, () => tag) },
  ])("fails closed for malformed encrypted entries %#", async (item) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: { items: [item], nextCursor: null } }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      fetchEncryptedLibraryEntries("current.jwt.token"),
    ).rejects.toThrow("Could not load your encrypted library");
  });

  it("rejects a cursor that does not match the final item", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { items: [entry], nextCursor: secondEntryId },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      fetchEncryptedLibraryEntries("current.jwt.token"),
    ).rejects.toThrow("Could not load your encrypted library");
  });

  it("rejects invalid identifiers and missing authentication before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchEncryptedLibraryFolders("current.jwt.token", ["bad-id"]),
    ).rejects.toThrow("Could not load your encrypted library");
    await expect(fetchEncryptedLibraryEntries("")).rejects.toThrow(
      "Reconnect to the cloud",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
