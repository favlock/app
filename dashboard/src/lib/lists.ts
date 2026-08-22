import type { BookmarkList, ListItem } from "../types/bookmark";

export function getListProgress(items: ListItem[]) {
  const completed = items.filter((item) => item.completed_at).length;
  const total = items.length;
  return {
    completed,
    total,
    percentage: total ? Math.round((completed / total) * 100) : 0,
  };
}

export function getBookmarkListIds(lists: BookmarkList[], bookmarkId: string) {
  return lists
    .filter((list) =>
      list.items.some((item) => item.bookmark.id === bookmarkId),
    )
    .map((list) => list.id);
}

export function hasReachedListLimit(listCount: number, listLimit: number) {
  return listLimit > 0 && listCount >= listLimit;
}

export function moveListItem(
  bookmarkIds: string[],
  bookmarkId: string,
  direction: "up" | "down",
): string[] {
  const currentIndex = bookmarkIds.indexOf(bookmarkId);
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (
    currentIndex < 0 ||
    nextIndex < 0 ||
    nextIndex >= bookmarkIds.length
  ) {
    return bookmarkIds;
  }

  const next = [...bookmarkIds];
  [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
  return next;
}
