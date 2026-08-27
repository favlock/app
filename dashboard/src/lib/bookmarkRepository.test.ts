import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanupDuplicateBookmarks,
  createBookmark,
  moveBookmarkToFolder,
  overwriteBookmarkImportContent,
  setBookmarkFavorite,
  trashBookmark,
  updateBookmark,
  type BookmarkWriteValues,
} from "./bookmarkRepository";

const accessToken = "current.jwt.token";
const bookmarkId = "11111111-1111-4111-8111-111111111111";
const secondBookmarkId = "22222222-2222-4222-8222-222222222222";
const folderId = "33333333-3333-4333-8333-333333333333";
const tagId = "44444444-4444-4444-8444-444444444444";

const values: BookmarkWriteValues = {
  title: "encrypted title",
  url: "encrypted url",
  folderId,
  existingTagIds: [tagId],
  newEncryptedTagNames: ["encrypted tag"],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bookmarkRepository", () => {
  it("creates an encrypted bookmark through the app API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { bookmarkId } }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createBookmark(accessToken, values)).resolves.toBe(bookmarkId);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/bookmarks",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${accessToken}`,
        }),
        body: JSON.stringify({
          encryptedTitle: values.title,
          encryptedUrl: values.url,
          folderId,
          existingTagIds: [tagId],
          newEncryptedTagNames: ["encrypted tag"],
        }),
      }),
    );
  });

  it("updates title and organization without sending URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateBookmark(accessToken, bookmarkId, values);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.favlock.example/v1/bookmarks/${bookmarkId}`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          encryptedTitle: values.title,
          folderId,
          existingTagIds: [tagId],
          newEncryptedTagNames: ["encrypted tag"],
        }),
      }),
    );
  });

  it("moves bookmarks to Trash through the app API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await trashBookmark(accessToken, bookmarkId);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.favlock.example/v1/bookmarks/${bookmarkId}/trash`,
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
  });

  it("sets favorite state without creating a browser timestamp", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await setBookmarkFavorite(accessToken, bookmarkId, true);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.favlock.example/v1/bookmarks/${bookmarkId}/favorite`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ isFavorite: true }),
      }),
    );
  });

  it("moves Collections and overwrites only encrypted import content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await moveBookmarkToFolder(accessToken, bookmarkId, folderId);
    await overwriteBookmarkImportContent(
      accessToken,
      bookmarkId,
      "enc:imported-title",
      "enc:imported-url",
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://api.favlock.example/v1/bookmarks/${bookmarkId}/folder`,
      expect.objectContaining({ body: JSON.stringify({ folderId }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://api.favlock.example/v1/bookmarks/${bookmarkId}/import-content`,
      expect.objectContaining({
        body: JSON.stringify({
          encryptedTitle: "enc:imported-title",
          encryptedUrl: "enc:imported-url",
        }),
      }),
    );
  });

  it("cleans selected duplicate groups and validates the returned count", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { removedCount: 1 } }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const groups = [
      { survivorId: bookmarkId, duplicateIds: [secondBookmarkId] },
    ];

    await expect(
      cleanupDuplicateBookmarks(accessToken, groups),
    ).resolves.toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/bookmarks/duplicates/cleanup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ groups }),
      }),
    );
  });

  it("fails closed for malformed responses and missing sessions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { bookmarkId: "database-id" } }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { removedCount: -1 } }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createBookmark(accessToken, values)).rejects.toThrow(
      "Could not create the encrypted bookmark.",
    );
    await expect(
      cleanupDuplicateBookmarks(accessToken, [
        { survivorId: bookmarkId, duplicateIds: [secondBookmarkId] },
      ]),
    ).rejects.toThrow("Could not clean up duplicate bookmarks.");
    await expect(createBookmark("", values)).rejects.toThrow(
      "Reconnect to the cloud",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
