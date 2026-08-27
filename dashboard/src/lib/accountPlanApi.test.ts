import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAccountPlan } from "./accountPlanApi";

const responseBody = {
  data: {
    id: "free",
    name: "Free",
    trashRecoveryDays: 7,
    limits: {
      bookmarks: 500,
      entries: 50,
      readspace: 25,
      collections: 0,
      tags: 0,
      lists: 3,
    },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAccountPlan", () => {
  it("calls the FavLock API with the current access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAccountPlan("current.jwt.token")).resolves.toEqual(
      responseBody.data,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/account/plan",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer current.jwt.token",
        }),
        credentials: "omit",
      }),
    );
  });

  it("rejects a missing token without making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAccountPlan("")).rejects.toThrow("Reconnect to the cloud");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps an unauthorized cloud response separate from local access", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );

    await expect(fetchAccountPlan("expired.jwt.token")).rejects.toThrow(
      "Reconnect to the cloud",
    );
  });

  it("keeps a cloud restriction separate from local access", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    );

    await expect(fetchAccountPlan("restricted.jwt.token")).rejects.toThrow(
      "Cloud access is restricted",
    );
  });

  it("fails closed when the response contract is incomplete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { ...responseBody.data, limits: { bookmarks: 500 } },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(fetchAccountPlan("current.jwt.token")).rejects.toThrow(
      "could not load",
    );
  });
});
