import { PartialBulkWriteError, editCloudBookmarkBatch, type BookmarkBulkAction, type BookmarkBulkResult } from "./bookmarkBulk";
import { editCloudEntryBatch, isTaskBulkAction, type EntryBulkAction } from "./entryBulk";
import { editLocalBookmarkBatch, editLocalEntryBatch } from "./localVault";

export type LibraryBulkAction = BookmarkBulkAction | EntryBulkAction;

// Namespaced keys keep bookmark and entry UUIDs independent in mixed selections.
export function librarySelectionId(kind: string, id: string): string {
  return `${kind === "bookmark" ? "bookmark" : kind === "todo" ? "task" : "entry"}:${id}`;
}

export async function editLibraryBatch(
  ids: string[], action: LibraryBulkAction,
  context: { local: boolean; ownerId: string; token: string; assertCurrent: () => void },
): Promise<BookmarkBulkResult[]> {
  if (ids.some((id) => !/^(bookmark|entry|task):.+$/.test(id))) throw new Error("Invalid selection.");
  if ((action.action === "favorite" || action.action === "unfavorite") && ids.some((id) => !id.startsWith("bookmark:")))
    throw new Error("Favorites are only available for bookmarks.");
  if (isTaskBulkAction(action) && ids.some((id) => !id.startsWith("task:"))) throw new Error("Select only tasks for this action.");
  const results: BookmarkBulkResult[] = [];
  for (const kind of ["bookmark", "entry"] as const) {
    const keys = ids.filter((id) => kind === "bookmark" ? id.startsWith("bookmark:") : !id.startsWith("bookmark:"));
    const selected = keys.map((id) => id.slice(id.indexOf(":") + 1));
    const resultKeys = new Map(selected.map((id, index) => [id, keys[index]]));
    if (!selected.length) continue;
    context.assertCurrent();
    try {
      if (kind === "bookmark") {
        if (isTaskBulkAction(action)) throw new Error("Unsupported bookmark action.");
        const batch = context.local
          ? await editLocalBookmarkBatch(context.ownerId, selected, action, context.assertCurrent)
          : await editCloudBookmarkBatch(context.token, selected, action);
        results.push(...batch.map((item) => ({ ...item, bookmarkId: librarySelectionId(kind, item.bookmarkId) })));
      } else {
        if (action.action === "favorite" || action.action === "unfavorite") throw new Error("Unsupported entry action.");
        const batch = context.local
          ? await editLocalEntryBatch(context.ownerId, selected, action, context.assertCurrent)
          : await editCloudEntryBatch(context.token, selected, action);
        results.push(...batch.map((item) => ({ bookmarkId: resultKeys.get(item.entryId)!, status: item.status })));
      }
    } catch {
      context.assertCurrent();
      throw new PartialBulkWriteError(results);
    }
  }
  return results;
}
