import type { Bookmark } from "../types/bookmark";
import type { HomeLibraryItem } from "./homeLibrary";

export const SORT_LABELS = {
  default: "Default order",
  "saved-desc": "Date saved: newest first",
  "saved-asc": "Date saved: oldest first",
  "name-asc": "Name: A–Z",
  "name-desc": "Name: Z–A",
  "website-asc": "Website: A–Z",
  "website-desc": "Website: Z–A",
  "favorited-desc": "Date favorited: newest first",
  "favorited-asc": "Date favorited: oldest first",
} as const;
export type BookmarkSortOrder = keyof typeof SORT_LABELS;
export interface BookmarkSorting {
  order: BookmarkSortOrder;
  favoritesFirst: boolean;
}
export const DEFAULT_BOOKMARK_SORTING: BookmarkSorting = {
  order: "default",
  favoritesFirst: false,
};
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
function website(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}
function date(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function compareBookmarks(left: Bookmark, right: Bookmark, sorting: BookmarkSorting): number {
  if (sorting.favoritesFirst) {
    const favorites = Number(!!right.is_favorite) - Number(!!left.is_favorite);
    if (favorites) return favorites;
  }
  const direction = sorting.order.endsWith("asc") ? 1 : -1;
  let comparison: number;
  if (sorting.order.startsWith("name-")) {
    comparison = collator.compare(left.title.trim(), right.title.trim()) * direction;
  } else if (sorting.order.startsWith("website-")) {
    const a = website(left.url);
    const b = website(right.url);
    // Missing websites stay last in either direction.
    comparison = !a || !b ? Number(!a) - Number(!b) : collator.compare(a, b) * direction;
    comparison ||= collator.compare(left.title.trim(), right.title.trim());
  } else if (sorting.order.startsWith("favorited-")) {
    comparison = (date(left.favorited_at) - date(right.favorited_at)) * direction;
  } else if (sorting.order !== "default") {
    comparison = (date(left.created_at) - date(right.created_at)) * direction;
  } else {
    // Preserve the caller's default ordering (including search relevance).
    return 0;
  }
  return comparison || date(right.created_at) - date(left.created_at) || left.id.localeCompare(right.id);
}

export function sortBookmarks(bookmarks: Bookmark[], sorting: BookmarkSorting): Bookmark[] {
  return [...bookmarks].sort((a, b) => compareBookmarks(a, b, sorting));
}

export function sortLibraryItems(items: HomeLibraryItem[], sorting: BookmarkSorting): HomeLibraryItem[] {
  const asSortable = (item: HomeLibraryItem): Bookmark => {
    if (item.kind === "bookmark") return item.bookmark;
    const entry = item.kind === "note" ? item.note : item.kind === "todo" ? item.todo : item.article.entry;
    return { id: `${item.kind}:${item.id}`, user_id: entry.user_id, title: entry.title, url: "", created_at: item.sortDate };
  };
  return items
    .map((item) => ({ item, bookmark: asSortable(item) }))
    .sort((a, b) => compareBookmarks(a.bookmark, b.bookmark, sorting))
    .map(({ item }) => item);
}
