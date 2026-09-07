import { describe, expect, it } from "vitest";
import {
  createLinkHealthBatches,
  groupBookmarksForLinkHealth,
} from "./linkHealthQueue";
import type { Bookmark } from "../types/bookmark";

function bookmark(index: number, url: string): Bookmark {
  return {
    id: `bookmark-${index}`,
    user_id: "user-1",
    title: `Bookmark ${index}`,
    url,
    created_at: "2026-09-07T08:00:00.000Z",
  };
}

describe("large link-health queues", () => {
  it("creates bounded batches for 10,000 distinct bookmarks", () => {
    const bookmarks = Array.from({ length: 10_000 }, (_, index) =>
      bookmark(index, `https://example-${index}.test/page`),
    );
    const groups = [...groupBookmarksForLinkHealth(bookmarks).entries()];
    const batches = createLinkHealthBatches(groups);

    expect(groups).toHaveLength(10_000);
    expect(batches).toHaveLength(625);
    expect(Math.max(...batches.map((batch) => batch.length))).toBe(16);
  });

  it("groups 10,000 tracking variants into one network check", () => {
    const bookmarks = Array.from({ length: 10_000 }, (_, index) =>
      bookmark(index, `https://example.test/page?utm_source=${index}`),
    );
    const groups = [...groupBookmarksForLinkHealth(bookmarks).entries()];

    expect(groups).toHaveLength(1);
    expect(groups[0]?.[1]).toHaveLength(10_000);
  });
});
