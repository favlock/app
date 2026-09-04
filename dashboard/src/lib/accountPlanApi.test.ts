import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./favLockAuth", () => import("../test/requestSessionAuthMock"));
import { fetchAccountPlan } from "./accountPlanApi";

const responseBody = {
  data: {
    id: "free",
    name: "Free",
    trashRecoveryDays: 7,
    limits: {
      bookmarks: 1_000,
      entries: 50,
      readspace: 25,
      highlights: 100,
      collections: 0,
      tags: 0,
      lists: 3,
    },
    bookmarkAccess: {
      mode: "normal",
      count: 925,
      limit: 1_000,
      graceEndsAt: null,
      cleanupAt: null,
    },
    highlightAccess: {
      count: 75,
      limit: 100,
      cleanupAt: null,
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

  it("accepts zero as the direct unlimited bookmark sentinel", async () => {
    const unlimitedResponse = {
      data: {
        ...responseBody.data,
        id: "pro",
        name: "Pro",
        trashRecoveryDays: 30,
        limits: {
          ...responseBody.data.limits,
          bookmarks: 0,
          entries: 1_000,
          readspace: 250,
          highlights: 0,
          lists: 0,
        },
        bookmarkAccess: {
          mode: "normal",
          count: 1_250,
          limit: 0,
          graceEndsAt: null,
          cleanupAt: null,
        },
        highlightAccess: {
          count: 1_250,
          limit: 0,
          cleanupAt: null,
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(unlimitedResponse), { status: 200 }),
      ),
    );

    await expect(fetchAccountPlan("current.jwt.token")).resolves.toEqual({
      id: "pro",
      name: "Pro",
      trashRecoveryDays: 30,
      limits: {
        bookmarks: 0,
        entries: 1_000,
        readspace: 250,
        highlights: 0,
        collections: 0,
        tags: 0,
        lists: 0,
      },
      bookmarkAccess: {
        mode: "normal",
        count: 1_250,
        limit: 0,
        graceEndsAt: null,
        cleanupAt: null,
      },
      highlightAccess: {
        count: 1_250,
        limit: 0,
        cleanupAt: null,
      },
    });
  });

  it("maps an active highlight cleanup deadline", async () => {
    const cleanupResponse = {
      data: {
        ...responseBody.data,
        highlightAccess: {
          count: 125,
          limit: 100,
          cleanupAt: "2027-03-02T12:00:00.000Z",
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(cleanupResponse), { status: 200 }),
      ),
    );

    await expect(fetchAccountPlan("current.jwt.token")).resolves.toMatchObject({
      highlightAccess: cleanupResponse.data.highlightAccess,
    });
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
