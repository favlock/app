import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addListItem,
  createEncryptedList,
  deleteEncryptedList,
  fetchEncryptedLists,
  removeListItem,
  reorderListItems,
  setBookmarkLists,
  setListItemCompleted,
  updateEncryptedList,
} from "./listRepository";

const listId = "11111111-1111-4111-8111-111111111111";
const secondListId = "22222222-2222-4222-8222-222222222222";
const bookmarkId = "33333333-3333-4333-8333-333333333333";
const secondBookmarkId = "44444444-4444-4444-8444-444444444444";

const list = {
  id: listId,
  encryptedName: "enc:list",
  createdAt: "2026-08-20T09:00:00.000Z",
  updatedAt: "2026-08-20T10:00:00.000Z",
};

const item = {
  bookmarkId,
  encryptedTitle: "enc:title",
  encryptedUrl: "enc:url",
  isFavorite: false,
  favoritedAt: null,
  bookmarkCreatedAt: "2026-08-20T08:00:00.000Z",
  position: 1,
  completedAt: null,
  createdAt: "2026-08-20T09:30:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("List API repository", () => {
  it("paginates Lists and their encrypted items with provider-neutral cursors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ items: [list], nextCursor: listId }),
      )
      .mockResolvedValueOnce(
        response({
          items: [{ ...list, id: secondListId, createdAt: "2026-08-19T09:00:00.000Z" }],
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(
        response({ items: [item], nextCursor: bookmarkId }),
      )
      .mockResolvedValueOnce(
        response({
          items: [{ ...item, bookmarkId: secondBookmarkId, position: 0 }],
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(response({ items: [], nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);

    const lists = await fetchEncryptedLists("current.jwt.token");

    expect(lists.map(({ id }) => id)).toEqual([secondListId, listId]);
    expect(lists[1]?.items.map(({ bookmarkId: id }) => id)).toEqual([
      secondBookmarkId,
      bookmarkId,
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://api.favlock.example/v1/lists?limit=100&cursor=${listId}`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      `https://api.favlock.example/v1/lists/${listId}/items?limit=200&cursor=${bookmarkId}`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it.each([
    { ...list, id: "bad" },
    { ...list, encryptedName: "" },
    { ...list, createdAt: "not-a-timestamp" },
  ])("fails closed for malformed encrypted Lists %#", async (value) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ items: [value], nextCursor: null })),
    );

    await expect(fetchEncryptedLists("current.jwt.token")).rejects.toThrow(
      "Could not load",
    );
  });

  it.each([
    { ...item, position: -1 },
    { ...item, completedAt: "not-a-timestamp" },
    { ...item, isFavorite: "false" },
  ])("fails closed for malformed encrypted List items %#", async (value) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [list], nextCursor: null }))
      .mockResolvedValueOnce(response({ items: [value], nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEncryptedLists("current.jwt.token")).rejects.toThrow(
      "Could not load",
    );
  });

  it("rejects a cursor that does not match the final item", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({ items: [list], nextCursor: secondListId }),
      ),
    );

    await expect(fetchEncryptedLists("current.jwt.token")).rejects.toThrow(
      "Could not load",
    );
  });

  it("creates a List and validates its identifier", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { listId } }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createEncryptedList("current.jwt.token", "enc:list"),
    ).resolves.toBe(listId);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/lists",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ encryptedName: "enc:list" }),
      }),
    );
  });

  it("uses narrow routes for every List command", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await updateEncryptedList("current.jwt.token", listId, "enc:renamed");
    await deleteEncryptedList("current.jwt.token", listId);
    await setListItemCompleted(
      "current.jwt.token",
      listId,
      bookmarkId,
      true,
    );
    await removeListItem("current.jwt.token", listId, bookmarkId);
    await addListItem("current.jwt.token", listId, bookmarkId);
    await setBookmarkLists("current.jwt.token", bookmarkId, [listId, listId]);
    await reorderListItems("current.jwt.token", listId, [bookmarkId]);

    expect(fetchMock.mock.calls.map(([url, options]) => [
      url,
      (options as RequestInit).method,
      (options as RequestInit).body,
    ])).toEqual([
      [`https://api.favlock.example/v1/lists/${listId}`, "PATCH", JSON.stringify({ encryptedName: "enc:renamed" })],
      [`https://api.favlock.example/v1/lists/${listId}`, "DELETE", undefined],
      [`https://api.favlock.example/v1/lists/${listId}/items/${bookmarkId}/completion`, "PATCH", JSON.stringify({ completed: true })],
      [`https://api.favlock.example/v1/lists/${listId}/items/${bookmarkId}`, "DELETE", undefined],
      [`https://api.favlock.example/v1/lists/${listId}/items`, "POST", JSON.stringify({ bookmarkId })],
      [`https://api.favlock.example/v1/bookmarks/${bookmarkId}/lists`, "PUT", JSON.stringify({ listIds: [listId] })],
      [`https://api.favlock.example/v1/lists/${listId}/items/order`, "PUT", JSON.stringify({ bookmarkIds: [bookmarkId] })],
    ]);
  });

  it("rejects missing authentication before a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEncryptedLists("")).rejects.toThrow("sign in again");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function response(data: unknown): Response {
  return new Response(JSON.stringify({ data }), { status: 200 });
}
