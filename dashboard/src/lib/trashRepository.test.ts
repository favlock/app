import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyTrash,
  fetchTrashItems,
  permanentlyDeleteTrashItem,
  restoreTrashItem,
} from "./trashRepository";

const trashId = "11111111-1111-4111-8111-111111111111";
const resourceId = "22222222-2222-4222-8222-222222222222";
const trashItem = {
  id: trashId,
  resourceId,
  resourceType: "bookmark",
  encryptedTitle: "enc:title",
  encryptedUrl: "enc:url",
  deletedAt: "2026-08-06T10:00:00.000Z",
  expiresAt: "2026-09-05T10:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Trash API reads", () => {
  it("loads and validates paginated encrypted Trash previews", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { items: [trashItem], nextCursor: trashId } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { items: [], nextCursor: null } }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTrashItems("current.jwt.token")).resolves.toEqual([
      trashItem,
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://api.favlock.example/v1/trash?limit=200&cursor=${trashId}`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("resolves changed identifiers through a bounded POST body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { items: [trashItem], nextCursor: null } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchTrashItems("current.jwt.token", [trashId, trashId]),
    ).resolves.toEqual([trashItem]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/trash/resolve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ids: [trashId] }),
      }),
    );
  });

  it("fails closed for malformed encrypted Trash previews", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              items: [{ ...trashItem, resourceType: "unknown" }],
              nextCursor: null,
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(fetchTrashItems("current.jwt.token")).rejects.toThrow(
      "Could not load Trash",
    );
  });
});

describe("Trash API commands", () => {
  it("restores through the FavLock API with the current token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { resourceId } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      restoreTrashItem("current.jwt.token", trashId),
    ).resolves.toBe(resourceId);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.favlock.example/v1/trash/${trashId}/restore`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer current.jwt.token",
        }),
        credentials: "omit",
      }),
    );
  });

  it("deletes one item forever through the FavLock API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await permanentlyDeleteTrashItem("current.jwt.token", trashId);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.favlock.example/v1/trash/${trashId}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("empties Trash without sending a user id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await emptyTrash("current.jwt.token");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/trash",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
    const requestOptions = fetchMock.mock.calls[0]?.[1] as
      | RequestInit
      | undefined;
    expect(requestOptions).not.toHaveProperty("body");
  });

  it("rejects missing authentication before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(emptyTrash("")).rejects.toThrow("Reconnect to the cloud");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed for a malformed restore response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { resourceId: "not-a-uuid" } }), {
          status: 200,
        }),
      ),
    );

    await expect(
      restoreTrashItem("current.jwt.token", trashId),
    ).rejects.toThrow("Could not restore this item");
  });
});
