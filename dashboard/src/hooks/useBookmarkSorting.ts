import { useState } from "react";
import {
  DEFAULT_BOOKMARK_SORTING,
  SORT_LABELS,
  type BookmarkSorting,
} from "../lib/bookmarkSorting";

export interface BookmarkSortPreference extends BookmarkSorting {
  bookmarksOnly: boolean;
}

const DEFAULT_PREFERENCE: BookmarkSortPreference = {
  ...DEFAULT_BOOKMARK_SORTING,
  bookmarksOnly: false,
};

function readBookmarkSortPreference(key: string): BookmarkSortPreference {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!value || typeof value !== "object") return DEFAULT_PREFERENCE;
    return {
      order: typeof value.order === "string" && Object.hasOwn(SORT_LABELS, value.order)
        ? value.order : "default",
      favoritesFirst: value.favoritesFirst === true,
      bookmarksOnly: value.bookmarksOnly === true,
    };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

export function useBookmarkSorting(userId: string | undefined) {
  const key = `favlock.bookmark-sorting.v1:${userId ?? "anonymous"}`;
  const [state, setState] = useState(() => ({
    key,
    value: readBookmarkSortPreference(key),
  }));
  const value = state.key === key ? state.value : readBookmarkSortPreference(key);
  const update = (next: BookmarkSortPreference) => {
    setState({ key, value: next });
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Sorting remains usable when browser storage is unavailable.
    }
  };
  return [value, update] as const;
}
