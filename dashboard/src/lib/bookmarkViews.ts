import type { Bookmark } from "../types/bookmark";

export type BookmarkView =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "unsorted" }
  | { kind: "folder"; id: string }
  | { kind: "tag"; id: string };

function compareDescending(left: string | null | undefined, right: string | null | undefined) {
  return (right ?? "").localeCompare(left ?? "");
}

export function bookmarksForView(
  bookmarks: Bookmark[],
  view: BookmarkView,
): Bookmark[] {
  const matching = bookmarks.filter((bookmark) => {
    switch (view.kind) {
      case "favorites":
        return bookmark.is_favorite === true;
      case "unsorted":
        return (bookmark.folders ?? []).length === 0;
      case "folder":
        return (bookmark.folders ?? []).some((folder) => folder.id === view.id);
      case "tag":
        return (bookmark.tags ?? []).some((tag) => tag.id === view.id);
      case "all":
        return true;
    }
  });

  return matching.sort((left, right) =>
    view.kind === "favorites"
      ? compareDescending(left.favorited_at, right.favorited_at) ||
        compareDescending(left.created_at, right.created_at)
      : compareDescending(left.created_at, right.created_at),
  );
}
