import type { BookmarkUsageCounts } from "./bookmarkUsage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function localKey(userId: string): string { return `favlock.bookmark-usage.v1:${userId}`; }

export function clearLocalBookmarkUsage(userId: string): void {
  try { localStorage.removeItem(localKey(userId)); } catch { /* storage may be unavailable */ }
}

export function forgetLocalBookmarkUsage(userId: string, bookmarkId: string): void {
  const counts = loadLocalBookmarkUsage(userId);
  delete counts[bookmarkId];
  try { localStorage.setItem(localKey(userId), JSON.stringify(counts)); } catch { /* storage may be unavailable */ }
}

export function loadLocalBookmarkUsage(userId: string): BookmarkUsageCounts {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(localKey(userId)) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(
      ([id, count]) => UUID.test(id) && Number.isSafeInteger(count) && Number(count) >= 0,
    ));
  } catch { return {}; }
}

export function recordLocalBookmarkOpen(userId: string, bookmarkId: string): BookmarkUsageCounts {
  const counts = loadLocalBookmarkUsage(userId);
  counts[bookmarkId] = Math.min(Number.MAX_SAFE_INTEGER, (counts[bookmarkId] ?? 0) + 1);
  try { localStorage.setItem(localKey(userId), JSON.stringify(counts)); } catch { /* current session still updates */ }
  return counts;
}
