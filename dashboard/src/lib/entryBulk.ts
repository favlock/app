import { postAuthenticatedJson } from "./authenticatedApi";

export type TaskBulkAction = { action: "due-date"; dueDate: string | null } | { action: "complete" } | { action: "reopen" };
export type EntryBulkAction =
  | TaskBulkAction
  | { action: "collection"; folderId: string | null }
  | { action: "add-tags" | "remove-tags"; tagIds: string[] }
  | { action: "trash" };
export type EntryBulkStatus = "updated" | "unchanged" | "not-found" | "tag-limit" | "failed";
export interface EntryBulkResult { entryId: string; status: EntryBulkStatus }
export const ENTRY_BULK_BATCH_SIZE = 100;

export function isBulkSuccess(result: EntryBulkResult): boolean {
  return result.status === "updated" || result.status === "unchanged";
}

export async function editCloudEntryBatch(
  token: string, entryIds: string[], action: EntryBulkAction,
): Promise<EntryBulkResult[]> {
  const payload = await postAuthenticatedJson("/v1/entries/bulk", token, { entryIds, ...action }, "Could not update these entries. Try again.");
  if (!payload || typeof payload !== "object" || !("data" in payload) || !payload.data ||
    typeof payload.data !== "object" || !("items" in payload.data) || !Array.isArray(payload.data.items))
    throw new Error("Could not verify the entry changes. Try again.");
  const expected = new Set(entryIds);
  if (payload.data.items.length !== expected.size) throw new Error("Incomplete entry results.");
  return payload.data.items.map((value: unknown) => {
    if (!value || typeof value !== "object" || !("entryId" in value) || !("status" in value) ||
      typeof value.entryId !== "string" || !expected.delete(value.entryId) ||
      !["updated", "unchanged", "not-found", "tag-limit", "failed"].includes(String(value.status)))
      throw new Error("Could not verify the entry changes. Try again.");
    return { entryId: value.entryId, status: value.status as EntryBulkStatus };
  });
}


export function isTaskBulkAction(action: { action: string }): action is TaskBulkAction {
  return action.action === "due-date" || action.action === "complete" || action.action === "reopen";
}
