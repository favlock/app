import { sortBookmarks, type BookmarkSorting } from "../lib/bookmarkSorting";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { searchCachedBookmarksOffMainThread } from "../lib/bookmarkSearchWorkerClient";
import { useEncryption } from "../context/useEncryption";
import { readLocalBookmarks } from "../lib/localVault";
import { DEFAULT_LIBRARY_SEARCH_FILTERS, hasActiveLibrarySearch, matchesLibraryMetadata, matchesLibraryText, type LibrarySearchFilters } from "../lib/librarySearchFilters";

export async function searchBookmarkLibrary(
  userId: string, cryptoKey: CryptoKey | null, isLocalAccount: boolean,
  query: string, options: { offset?: number; limit?: number; sorting?: BookmarkSorting; filters?: LibrarySearchFilters } = {},
) {
  const normalized = query.trim();
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(1, Math.floor(options.limit ?? 100));
  const filters = options.filters ?? DEFAULT_LIBRARY_SEARCH_FILTERS;
  if (!isLocalAccount) {
    return searchCachedBookmarksOffMainThread(userId, normalized, {
      offset,
      limit,
      sorting: options.sorting,
      filters: options.filters,
    });
  }
  const matches = (await readLocalBookmarks(userId, cryptoKey!)).filter(
    (bookmark) => {
      if (bookmark.is_highlight_source) return false;
      return matchesLibraryMetadata(filters, "bookmark", bookmark.folders?.[0]?.id ?? null,
        (bookmark.tags ?? []).map((tag) => tag.id), Boolean(bookmark.is_favorite)) &&
        matchesLibraryText(normalized, filters.field, {
          title: bookmark.title,
          url: bookmark.url,
          tags: (bookmark.tags ?? []).map((tag) => tag.name).join(" "),
          collection: (bookmark.folders ?? []).map((folder) => folder.name).join(" "),
        });
    },
  );
  return {
    bookmarks: (options.sorting ? sortBookmarks(matches, options.sorting) : matches).slice(offset, offset + limit),
    total: matches.length,
    offset,
    limit,
  };
}

export function useBookmarkLocalSearch(
  query: string,
  options: { offset?: number; limit?: number; sorting?: BookmarkSorting; filters?: LibrarySearchFilters } = {},
) {
  const { user, isLocalAccount } = useAuth();
  const { cryptoKey } = useEncryption();
  const normalized = query.trim();
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(1, Math.floor(options.limit ?? 100));

  return useQuery({
    queryKey: [
      "bookmarks",
      "local-search",
      user?.id,
      normalized,
      options.sorting,
      options.filters,
      offset,
      limit,
    ],
    queryFn: async () => {
      return searchBookmarkLibrary(user!.id, cryptoKey, isLocalAccount, normalized, { offset, limit, sorting: options.sorting, filters: options.filters });
    },
    enabled: Boolean(user?.id) && hasActiveLibrarySearch(normalized, options.filters ?? DEFAULT_LIBRARY_SEARCH_FILTERS) &&
      (!isLocalAccount || !!cryptoKey),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });
}
