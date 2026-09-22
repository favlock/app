import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  readLocal: vi.fn(),
  readSnapshot: vi.fn(),
  saveSnapshot: vi.fn(),
}));
vi.mock("./authenticatedApi", () => ({
  fetchAuthenticatedJson: mocks.fetch,
}));
vi.mock("./cloudBookmarkUsageQueue", () => ({
  readCloudBookmarkUsage: mocks.readLocal,
  readCloudBookmarkUsageSnapshot: mocks.readSnapshot,
  saveCloudBookmarkUsageSnapshot: mocks.saveSnapshot,
}));

import { loadBookmarkUsage } from "./bookmarkUsage";
import { clearLocalBookmarkUsage, loadLocalBookmarkUsage, recordLocalBookmarkOpen } from "./localBookmarkUsage";

const first = "123e4567-e89b-42d3-a456-426614174000";
const second = "123e4567-e89b-42d3-a456-426614174001";

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.readLocal.mockReset().mockResolvedValue({ installationId: null, totals: {}, pending: {}, generations: {} });
  mocks.readSnapshot.mockReset().mockResolvedValue(null);
  mocks.saveSnapshot.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
});

describe("bookmark usage", () => {
  it("loads every page of account counts", async () => {
    mocks.fetch
      .mockResolvedValueOnce({ data: { items: [{ bookmarkId: first, openCount: 5 }], nextCursor: first } })
      .mockResolvedValueOnce({ data: { items: [{ bookmarkId: second, openCount: 2 }], nextCursor: null } });
    expect(await loadBookmarkUsage("user-id", "token")).toEqual({ [first]: 5, [second]: 2 });
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, `/v1/bookmarks/usage?cursor=${first}`, "token", "Could not load bookmark usage.");
  });

  it("rejects malformed counts", async () => {
    mocks.fetch.mockResolvedValue({ data: { items: [{ bookmarkId: first, openCount: -1 }], nextCursor: null } });
    await expect(loadBookmarkUsage("user-id", "token")).rejects.toThrow("Could not load bookmark usage.");
  });

  it("adds only unsynced local opens to the server total", async () => {
    mocks.readLocal.mockResolvedValue({ installationId: second, totals: { [first]: 7, [second]: 2 }, pending: { [first]: 2, [second]: 2 }, generations: { [first]: second, [second]: first } });
    mocks.fetch.mockResolvedValue({ data: { items: [{ bookmarkId: first, openCount: 12 }], nextCursor: null } });
    expect(await loadBookmarkUsage("user-id", "token")).toEqual({ [first]: 14, [second]: 2 });
    expect(mocks.fetch).toHaveBeenCalledWith("/v1/bookmarks/usage", "token", "Could not load bookmark usage.");
  });

  it("uses durable local counts when offline", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mocks.readLocal.mockResolvedValue({ installationId: second, totals: { [first]: 3 }, pending: { [first]: 3 }, generations: { [first]: second } });
    expect(await loadBookmarkUsage("user-id", "token")).toEqual({ [first]: 3 });
    expect(mocks.fetch).not.toHaveBeenCalled();
    online.mockRestore();
  });

  it("keeps the last cross-device aggregate visible after an offline reload", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mocks.readSnapshot.mockResolvedValue({ items: { [first]: { count: 12, baselineTotal: 2, baselineGenerationId: second } } });
    mocks.readLocal.mockResolvedValue({ installationId: null, totals: { [first]: 3 }, pending: { [first]: 1 }, generations: { [first]: second } });
    expect(await loadBookmarkUsage("user-id", "token")).toEqual({ [first]: 13 });
    expect(mocks.fetch).not.toHaveBeenCalled();
    online.mockRestore();
  });

  it("includes an open queued while the server page was loading", async () => {
    mocks.readLocal
      .mockResolvedValueOnce({ installationId: second, totals: { [first]: 1 }, pending: { [first]: 0 }, generations: { [first]: second } })
      .mockResolvedValueOnce({ installationId: second, totals: { [first]: 2 }, pending: { [first]: 1 }, generations: { [first]: second } });
    mocks.fetch.mockResolvedValue({ data: { items: [{ bookmarkId: first, openCount: 1 }], nextCursor: null } });
    expect(await loadBookmarkUsage("user-id", "token")).toEqual({ [first]: 2 });
  });

  it("keeps local counts isolated by vault and clears them with the vault", () => {
    recordLocalBookmarkOpen("vault-a", first);
    recordLocalBookmarkOpen("vault-a", first);
    expect(loadLocalBookmarkUsage("vault-a")).toEqual({ [first]: 2 });
    expect(loadLocalBookmarkUsage("vault-b")).toEqual({});
    clearLocalBookmarkUsage("vault-a");
    expect(loadLocalBookmarkUsage("vault-a")).toEqual({});
  });
});
