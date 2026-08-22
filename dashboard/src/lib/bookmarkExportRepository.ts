import type { Bookmark } from "../types/bookmark";
import { getCachedBookmarksForUser } from "./bookmarkCache";

export async function loadAllBookmarksForExport(
  userId: string,
): Promise<Bookmark[]> {
  if (!userId) throw new Error("You must be signed in to export bookmarks.");
  return (await getCachedBookmarksForUser(userId)).sort(
    (left, right) =>
      right.created_at.localeCompare(left.created_at) ||
      right.id.localeCompare(left.id),
  );
}
