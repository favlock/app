import { normalizeBookmarkUrlForLinkCheck } from "./bookmarkUrl";
import type { Bookmark } from "../types/bookmark";

export type LinkHealthBookmarkGroup = [url: string, bookmarks: Bookmark[]];

export function groupBookmarksForLinkHealth(
  bookmarks: Bookmark[],
): Map<string, Bookmark[]> {
  const groups = new Map<string, Bookmark[]>();
  for (const bookmark of bookmarks) {
    if (bookmark.is_highlight_source) continue;
    const urlKey = normalizeBookmarkUrlForLinkCheck(bookmark.url);
    if (!urlKey) continue;
    const existing = groups.get(urlKey);
    if (existing) existing.push(bookmark);
    else groups.set(urlKey, [bookmark]);
  }
  return groups;
}

export function createLinkHealthBatches(
  groups: LinkHealthBookmarkGroup[],
  batchSize = 16,
): LinkHealthBookmarkGroup[][] {
  const batches: LinkHealthBookmarkGroup[][] = [];
  for (let offset = 0; offset < groups.length; offset += batchSize) {
    batches.push(groups.slice(offset, offset + batchSize));
  }
  return batches;
}
