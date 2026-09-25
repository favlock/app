import { fetchAuthenticatedJson } from "./authenticatedApi";
import { readCloudBookmarkUsage, readCloudBookmarkUsageSnapshot, saveCloudBookmarkUsageSnapshot, type UsageSnapshot } from "./cloudBookmarkUsageQueue";
import { CloudAccessError } from "./cloudAccess";

export type BookmarkUsageCounts = Record<string, number>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function combineOfflineCounts(snapshot: UsageSnapshot | null, local: Awaited<ReturnType<typeof readCloudBookmarkUsage>>): BookmarkUsageCounts {
  if (!snapshot) return local.totals;
  const counts: BookmarkUsageCounts = {};
  for (const [bookmarkId, { count, baselineTotal, baselineGenerationId }] of Object.entries(snapshot.items)) {
    const sameGeneration = baselineGenerationId === (local.generations[bookmarkId] ?? null);
    counts[bookmarkId] = count + Math.max(0, (local.totals[bookmarkId] ?? 0) - (sameGeneration ? baselineTotal : 0));
  }
  for (const [bookmarkId, localCount] of Object.entries(local.totals)) {
    if (!(bookmarkId in counts)) counts[bookmarkId] = localCount;
  }
  return counts;
}

function combineOnlineCounts(serverCounts: Record<string, number>, local: Awaited<ReturnType<typeof readCloudBookmarkUsage>>): BookmarkUsageCounts {
  const counts: BookmarkUsageCounts = {};
  for (const [bookmarkId, count] of Object.entries(serverCounts)) counts[bookmarkId] = count + (local.pending[bookmarkId] ?? 0);
  for (const [bookmarkId, localCount] of Object.entries(local.totals)) {
    if (!(bookmarkId in counts)) counts[bookmarkId] = localCount;
  }
  return counts;
}

export async function loadBookmarkUsage(userId: string, accessToken: string): Promise<BookmarkUsageCounts> {
  const local = await readCloudBookmarkUsage(userId);
  if (!navigator.onLine) return combineOfflineCounts(await readCloudBookmarkUsageSnapshot(userId), local);
  const serverCounts: Record<string, number> = {};
  let cursor: string | null = null;
  try {
    do {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      const path: `/v1/${string}` = `/v1/bookmarks/usage${params.size ? `?${params}` : ""}`;
      const payload = await fetchAuthenticatedJson(path, accessToken, "Could not load bookmark usage.");
      const data = payload && typeof payload === "object" && "data" in payload ? payload.data : null;
      if (!data || typeof data !== "object" || !("items" in data) || !Array.isArray(data.items) || !("nextCursor" in data))
        throw new Error("Could not load bookmark usage.");
      for (const item of data.items) {
        if (!item || typeof item !== "object" || !UUID.test(item.bookmarkId) || !Number.isSafeInteger(item.openCount) || item.openCount < 0)
          throw new Error("Could not load bookmark usage.");
        serverCounts[item.bookmarkId] = item.openCount;
      }
      const next = data.nextCursor;
      if (next !== null && (typeof next !== "string" || !UUID.test(next) || next === cursor))
        throw new Error("Could not load bookmark usage.");
      cursor = next;
    } while (cursor);
  } catch (error) {
    if (error instanceof CloudAccessError && error.code === "unavailable")
      return combineOfflineCounts(await readCloudBookmarkUsageSnapshot(userId), await readCloudBookmarkUsage(userId));
    throw error;
  }
  const latest = await readCloudBookmarkUsage(userId);
  const snapshot: UsageSnapshot = { items: Object.fromEntries(Object.entries(serverCounts).map(([bookmarkId, count]) => [bookmarkId, {
    count, baselineTotal: local.totals[bookmarkId] ?? 0, baselineGenerationId: local.generations[bookmarkId] ?? null,
  }])) };
  await saveCloudBookmarkUsageSnapshot(userId, local.installationId, snapshot).catch(() => { /* An online result remains usable without a snapshot. */ });
  return combineOnlineCounts(serverCounts, latest);
}
