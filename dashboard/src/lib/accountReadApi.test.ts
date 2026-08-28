import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./favLockAuth", () => import("../test/requestSessionAuthMock"));
import { fetchBillingSubscription } from "./billingSubscriptionApi";
import { fetchResourceUsage } from "./resourceUsageApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("account read API clients", () => {
  it("loads the billing subscription through the FavLock API", async () => {
    const data = {
      provider: "creem",
      status: "active",
      currentPeriodEnd: "2026-09-20T00:00:00+00:00",
      cancelAtPeriodEnd: false,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchBillingSubscription("current.jwt.token"),
    ).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/account/subscription",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer current.jwt.token",
        }),
        credentials: "omit",
      }),
    );
  });

  it("preserves an account without a billing subscription", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: null }), { status: 200 }),
      ),
    );

    await expect(
      fetchBillingSubscription("current.jwt.token"),
    ).resolves.toBeNull();
  });

  it("loads resource usage through the FavLock API", async () => {
    const data = {
      bookmarks: 12,
      entries: 3,
      readspace: 4,
      collections: 5,
      tags: 6,
      lists: 2,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchResourceUsage("current.jwt.token")).resolves.toEqual(
      data,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/account/usage",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer current.jwt.token",
        }),
      }),
    );
  });

  it("fails closed for malformed account data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: { bookmarks: 12, entries: -1 } }),
          { status: 200 },
        ),
      ),
    );

    await expect(fetchResourceUsage("current.jwt.token")).rejects.toThrow(
      "could not load",
    );
  });

  it("does not expose API error details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "service_unavailable",
              message: "Internal upstream table detail",
            },
          }),
          { status: 503 },
        ),
      ),
    );

    await expect(
      fetchBillingSubscription("current.jwt.token"),
    ).rejects.toThrow("could not load your subscription");
  });
});
