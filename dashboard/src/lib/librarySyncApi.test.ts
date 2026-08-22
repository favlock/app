import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchLibrarySyncChanges,
  fetchLibrarySyncStatus,
} from "./librarySyncApi";

const resourceId = "11111111-1111-4111-8111-111111111111";
const change = {
  resourceType: "trash",
  resourceId,
  revision: "8",
  operation: "upsert",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("library sync API client", () => {
  it("loads exact decimal status through the FavLock API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { revision: "9223372036854775807", deltaFloor: "42" },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchLibrarySyncStatus("current.jwt.token"),
    ).resolves.toEqual({
      revision: "9223372036854775807",
      deltaFloor: "42",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/library/sync/status",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer current.jwt.token",
        }),
      }),
    );
  });

  it("paginates changes with the returned provider-neutral cursor", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              resetRequired: false,
              changes: [change],
              nextCursor: {
                revision: change.revision,
                resourceType: change.resourceType,
                resourceId,
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              resetRequired: false,
              changes: [],
              nextCursor: null,
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchLibrarySyncChanges("current.jwt.token", "5", "10"),
    ).resolves.toEqual([change]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.favlock.example/v1/library/sync/changes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          afterRevision: "5",
          throughRevision: "10",
          cursor: {
            revision: "8",
            resourceType: "trash",
            resourceId,
          },
          limit: 500,
        }),
      }),
    );
  });

  it("preserves the full-rebuild signal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              resetRequired: true,
              changes: [],
              nextCursor: null,
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      fetchLibrarySyncChanges("current.jwt.token", "1", "10"),
    ).rejects.toThrow("sync reset required");
  });

  it.each([
    { data: { revision: 9, deltaFloor: "2" } },
    { data: { revision: "9", deltaFloor: "10" } },
  ])("fails closed for malformed status %#", async (payload) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      ),
    );

    await expect(
      fetchLibrarySyncStatus("current.jwt.token"),
    ).rejects.toThrow("Could not synchronize");
  });

  it("fails closed for a cursor that does not match the last change", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              resetRequired: false,
              changes: [change],
              nextCursor: { ...change, resourceId: "22222222-2222-4222-8222-222222222222" },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      fetchLibrarySyncChanges("current.jwt.token", "5", "10"),
    ).rejects.toThrow("Could not synchronize");
  });

  it("rejects a missing token before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchLibrarySyncStatus("")).rejects.toThrow("sign in again");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
