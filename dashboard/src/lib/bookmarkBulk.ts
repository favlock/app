import { postAuthenticatedJson } from "./authenticatedApi";

export type BookmarkBulkAction =
  | { action: "collection"; folderId: string | null }
  | { action: "add-tags" | "remove-tags"; tagIds: string[] }
  | { action: "favorite" } | { action: "unfavorite" } | { action: "trash" };
export type BookmarkBulkStatus = "updated" | "unchanged" | "not-found" | "tag-limit" | "failed";
export interface BookmarkBulkResult { bookmarkId: string; status: BookmarkBulkStatus }
export const BOOKMARK_BULK_BATCH_SIZE = 100;

export function isBulkSuccess(result: BookmarkBulkResult): boolean {
  return result.status === "updated" || result.status === "unchanged";
}

export async function editCloudBookmarkBatch(
  token: string, bookmarkIds: string[], action: BookmarkBulkAction,
): Promise<BookmarkBulkResult[]> {
  const payload = await postAuthenticatedJson("/v1/bookmarks/bulk", token, { bookmarkIds, ...action }, "Could not update these bookmarks. Try again.");
  if (!payload || typeof payload !== "object" || !("data" in payload) || !payload.data ||
    typeof payload.data !== "object" || !("items" in payload.data) || !Array.isArray(payload.data.items))
    throw new Error("Could not verify the bookmark changes. Try again.");
  const expected = new Set(bookmarkIds);
  if (payload.data.items.length !== expected.size) throw new Error("Incomplete bookmark results.");
  return payload.data.items.map((value: unknown) => {
    if (!value || typeof value !== "object" || !("bookmarkId" in value) || !("status" in value) ||
      typeof value.bookmarkId !== "string" || !expected.delete(value.bookmarkId) ||
      !["updated", "unchanged", "not-found", "tag-limit", "failed"].includes(String(value.status)))
      throw new Error("Could not verify the bookmark changes. Try again.");
    return { bookmarkId: value.bookmarkId, status: value.status as BookmarkBulkStatus };
  });
}

export class PartialBulkWriteError extends Error {
  readonly results: BookmarkBulkResult[];
  constructor(results: BookmarkBulkResult[]) { super("The bulk operation stopped."); this.results = results; }
}

// Freeze IDs once, bound requests, and stop dispatching after a transport failure.
// Unsent and uncertain items remain retryable; acknowledged successes do not.
export async function runBookmarkBulkEdit(
  ids: string[],
  write: (ids: string[]) => Promise<BookmarkBulkResult[]>,
  assertCurrent: () => void,
  onProgress: (completed: number, results: BookmarkBulkResult[]) => void,
): Promise<BookmarkBulkResult[]> {
  const selected = [...new Set(ids)];
  const results: BookmarkBulkResult[] = [];
  for (let offset = 0; offset < selected.length; offset += BOOKMARK_BULK_BATCH_SIZE) {
    assertCurrent();
    const batch = selected.slice(offset, offset + BOOKMARK_BULK_BATCH_SIZE);
    try {
      results.push(...await write(batch));
    } catch (error) {
      assertCurrent();
      if (error instanceof PartialBulkWriteError) results.push(...error.results);
      const completed = new Set(results.map((item) => item.bookmarkId));
      results.push(...selected.slice(offset).filter((id) => !completed.has(id)).map((bookmarkId) => ({ bookmarkId, status: "failed" as const })));
      onProgress(selected.length, results);
      return results;
    }
    assertCurrent();
    onProgress(Math.min(offset + batch.length, selected.length), results);
  }
  return results;
}
