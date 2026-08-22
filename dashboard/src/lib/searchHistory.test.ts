import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addSearchHistoryEntry,
  clearCloudSearchHistoryForUser,
  decryptSearchHistory,
  loadCloudSearchHistory,
  normalizeSearchHistory,
  saveCloudSearchHistory,
  type SearchHistoryEntry,
} from "./searchHistory";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("search history", () => {
  it("keeps the ten most recent unique searches", () => {
    const entries: SearchHistoryEntry[] = Array.from(
      { length: 12 },
      (_, index) => ({
        query: `search ${index}`,
        searchedAt: new Date(2026, 0, index + 1).toISOString(),
      }),
    );

    const normalized = normalizeSearchHistory(entries);

    expect(normalized).toHaveLength(10);
    expect(normalized[0].query).toBe("search 11");
    expect(normalized.at(-1)?.query).toBe("search 2");
  });

  it("moves a repeated search to the front without duplicating it", () => {
    const entries: SearchHistoryEntry[] = [
      { query: "FavLock", searchedAt: "2026-08-01T00:00:00.000Z" },
      { query: "privacy", searchedAt: "2026-08-02T00:00:00.000Z" },
    ];

    const updated = addSearchHistoryEntry(
      entries,
      "  FavLock  ",
      "2026-08-03T00:00:00.000Z",
    );

    expect(updated.map((entry) => entry.query)).toEqual([
      "FavLock",
      "privacy",
    ]);
  });

  it("returns no plaintext when an encrypted payload cannot be read", async () => {
    await expect(
      decryptSearchHistory("enc:broken", async () => "enc:broken"),
    ).resolves.toEqual([]);
  });

  it("loads and decrypts the opaque cloud payload through the FavLock API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { encryptedHistory: "enc:history" } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const decrypt = vi.fn().mockResolvedValue(
      JSON.stringify([
        { query: "FavLock", searchedAt: "2026-08-20T09:00:00.000Z" },
      ]),
    );

    await expect(
      loadCloudSearchHistory("current.jwt.token", decrypt),
    ).resolves.toEqual([
      { query: "FavLock", searchedAt: "2026-08-20T09:00:00.000Z" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/account/search-history",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer current.jwt.token",
        }),
      }),
    );
    expect(decrypt).toHaveBeenCalledExactlyOnceWith("enc:history");
  });

  it("saves normalized encrypted history and clears it through narrow routes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const encrypt = vi.fn().mockResolvedValue("enc:normalized-history");

    await saveCloudSearchHistory(
      "current.jwt.token",
      [
        { query: "  privacy  ", searchedAt: "2026-08-20T09:00:00.000Z" },
      ],
      encrypt,
    );
    await clearCloudSearchHistoryForUser("current.jwt.token");

    expect(encrypt).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify([
        { query: "privacy", searchedAt: "2026-08-20T09:00:00.000Z" },
      ]),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.favlock.example/v1/account/search-history",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ encryptedHistory: "enc:normalized-history" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.favlock.example/v1/account/search-history",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("fails closed for a malformed API response and missing authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { encryptedHistory: 123 } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      loadCloudSearchHistory("current.jwt.token", async (value) => value),
    ).rejects.toThrow("Could not load");
    await expect(
      clearCloudSearchHistoryForUser(""),
    ).rejects.toThrow("sign in again");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
