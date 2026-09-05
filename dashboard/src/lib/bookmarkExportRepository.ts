import type { Bookmark } from "../types/bookmark";
import { getCachedBookmarksForUser } from "./bookmarkCache";
import { readLocalBookmarks } from "./localVault";

export async function loadAllBookmarksForExport(
  userId: string,
  localKey?: CryptoKey,
): Promise<Bookmark[]> {
  if (!userId) throw new Error("You must be signed in to export bookmarks.");
  const bookmarks = localKey
    ? await readLocalBookmarks(userId, localKey)
    : await getCachedBookmarksForUser(userId);
  return bookmarks.sort(
    (left, right) =>
      right.created_at.localeCompare(left.created_at) ||
      right.id.localeCompare(left.id),
  );
}
