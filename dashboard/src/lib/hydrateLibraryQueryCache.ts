import type { QueryClient } from "@tanstack/react-query";
import {
  getCachedBookmarksForUser,
  getCachedEntriesForUser,
  getCachedFoldersForUser,
  getCachedTagsForUser,
  getCachedTrashForUser,
} from "./bookmarkCache";
import { sortFolders } from "./folderOrder";
import { countRelations } from "./relationCounts";
import type { Note, ReadspaceEntry, Todo } from "../types/bookmark";
import { captureLocalVaultWork } from "./localVaultWork";

export async function hydrateLibraryQueryCache(
  queryClient: QueryClient,
  userId: string,
): Promise<void> {
  const assertCurrent = captureLocalVaultWork(userId);
  const [bookmarks, entries, folders, tags, cachedTrash] = await Promise.all([
    getCachedBookmarksForUser(userId),
    getCachedEntriesForUser(userId),
    getCachedFoldersForUser(userId),
    getCachedTagsForUser(userId),
    getCachedTrashForUser(userId),
  ]);
  const visibleBookmarks = bookmarks.filter(
    (bookmark) => !bookmark.is_highlight_source,
  );
  const newestFirst = <T extends { created_at: string }>(rows: T[]) =>
    [...rows].sort((left, right) =>
      right.created_at.localeCompare(left.created_at),
    );
  const notes = newestFirst(
    entries.filter((entry): entry is Note => entry.kind === "note"),
  );
  const todos = newestFirst(
    entries.filter((entry): entry is Todo => entry.kind === "todo"),
  );
  const readspace = newestFirst(
    entries.filter(
      (entry): entry is ReadspaceEntry => entry.kind === "read",
    ),
  );
  const now = Date.now();
  const trash = cachedTrash
    .filter((item) => new Date(item.expiresAt).getTime() > now)
    .sort((left, right) => right.deletedAt.localeCompare(left.deletedAt));
  const folderRelationIds = [
    ...visibleBookmarks.flatMap((bookmark) =>
      (bookmark.folders ?? []).map((folder) => folder.id),
    ),
    ...entries.flatMap((entry) => (entry.folder ? [entry.folder.id] : [])),
  ];
  const tagRelationIds = [
    ...visibleBookmarks.flatMap((bookmark) =>
      (bookmark.tags ?? []).map((tag) => tag.id),
    ),
    ...entries.flatMap((entry) =>
      (entry.tags ?? []).map((tag) => tag.id),
    ),
  ];

  assertCurrent();
  queryClient.setQueryData(
    ["bookmarks", "local-cache", userId],
    visibleBookmarks,
  );
  queryClient.setQueryData(["folders", userId], sortFolders(folders));
  queryClient.setQueryData(
    ["tags", userId],
    [...tags].sort((left, right) => left.name.localeCompare(right.name)),
  );
  queryClient.setQueryData(["notes", userId], notes);
  queryClient.setQueryData(["todos", userId], todos);
  queryClient.setQueryData(["readspace", userId], readspace);
  queryClient.setQueryData(["trash", userId], trash);

  queryClient.setQueryData(["notes", "count", userId], notes.length);
  queryClient.setQueryData(["todos", "count", userId], todos.length);
  queryClient.setQueryData(["readspace", "count", userId], readspace.length);
  queryClient.setQueryData(
    ["entries", "count", userId],
    notes.length + todos.length,
  );
  queryClient.setQueryData(["trash", "count", userId], trash.length);
  queryClient.setQueryData(["bookmarks", "counts", userId], {
    bookmarkCount: visibleBookmarks.length,
    favoriteCount: visibleBookmarks.filter((bookmark) => bookmark.is_favorite)
      .length,
    unsortedCount: visibleBookmarks.filter(
      (bookmark) => (bookmark.folders ?? []).length === 0,
    ).length,
  });
  queryClient.setQueryData(
    ["bookmarks", "folderCounts", userId],
    countRelations(folderRelationIds),
  );
  queryClient.setQueryData(
    ["bookmarks", "tagCounts", userId],
    countRelations(tagRelationIds),
  );
}
