import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bookmark } from "../types/bookmark";

const mocks = vi.hoisted(() => ({
  getCachedBookmarksForUser: vi.fn(),
}));

vi.mock("./bookmarkCache", () => ({
  getCachedBookmarksForUser: mocks.getCachedBookmarksForUser,
}));

import { loadAllBookmarksForExport } from "./bookmarkExportRepository";

function bookmark(id: string, createdAt: string): Bookmark {
  return {
    id,
    user_id: "user-1",
    title: `Title ${id}`,
    url: `https://example.com/${id}`,
    created_at: createdAt,
    folders: [],
    tags: [],
  };
}

describe("bookmark export repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the synchronized cache and sorts newest bookmarks first", async () => {
    const oldest = bookmark(
      "11111111-1111-4111-8111-111111111111",
      "2026-08-06T12:00:00.000Z",
    );
    const newest = bookmark(
      "22222222-2222-4222-8222-222222222222",
      "2026-08-07T12:00:00.000Z",
    );
    mocks.getCachedBookmarksForUser.mockResolvedValue([oldest, newest]);

    await expect(loadAllBookmarksForExport("user-1")).resolves.toEqual([
      newest,
      oldest,
    ]);
    expect(mocks.getCachedBookmarksForUser).toHaveBeenCalledExactlyOnceWith(
      "user-1",
    );
  });

  it("rejects a missing user before reading the cache", async () => {
    await expect(loadAllBookmarksForExport("")).rejects.toThrow(
      "signed in",
    );
    expect(mocks.getCachedBookmarksForUser).not.toHaveBeenCalled();
  });

  it("propagates a cache failure", async () => {
    mocks.getCachedBookmarksForUser.mockRejectedValue(
      new Error("cache unavailable"),
    );

    await expect(loadAllBookmarksForExport("user-1")).rejects.toThrow(
      "cache unavailable",
    );
  });
});
