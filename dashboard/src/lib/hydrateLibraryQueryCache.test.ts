import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bookmark } from "../types/bookmark";

const mocks = vi.hoisted(() => ({
  getCachedBookmarksForUser: vi.fn(),
  getCachedEntriesForUser: vi.fn(),
  getCachedFoldersForUser: vi.fn(),
  getCachedTagsForUser: vi.fn(),
  getCachedTrashForUser: vi.fn(),
}));

vi.mock("./bookmarkCache", () => mocks);

import { hydrateLibraryQueryCache } from "./hydrateLibraryQueryCache";

function bookmark(
  id: string,
  overrides: Partial<Bookmark> = {},
): Bookmark {
  return {
    id,
    user_id: "user-1",
    title: `Title ${id}`,
    url: `https://example.com/${id}`,
    created_at: "2026-09-04T00:00:00.000Z",
    folders: [],
    tags: [],
    ...overrides,
  };
}

describe("hydrateLibraryQueryCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedEntriesForUser.mockResolvedValue([]);
    mocks.getCachedFoldersForUser.mockResolvedValue([]);
    mocks.getCachedTagsForUser.mockResolvedValue([]);
    mocks.getCachedTrashForUser.mockResolvedValue([]);
  });

  it("keeps hidden highlight sources out of normal bookmark cache views and counts", async () => {
    const visible = bookmark("visible", { is_favorite: true });
    const hiddenSource = bookmark("hidden", {
      is_highlight_source: true,
      is_favorite: true,
    });
    mocks.getCachedBookmarksForUser.mockResolvedValue([
      visible,
      hiddenSource,
    ]);
    const queryClient = new QueryClient();

    await hydrateLibraryQueryCache(queryClient, "user-1");

    expect(
      queryClient.getQueryData(["bookmarks", "local-cache", "user-1"]),
    ).toEqual([visible]);
    expect(
      queryClient.getQueryData(["bookmarks", "counts", "user-1"]),
    ).toEqual({ bookmarkCount: 1, favoriteCount: 1, unsortedCount: 1 });
  });
});
