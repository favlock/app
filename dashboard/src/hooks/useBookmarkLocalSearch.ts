import { sortBookmarks, type BookmarkSorting } from "../lib/bookmarkSorting";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { searchCachedBookmarksOffMainThread } from "../lib/bookmarkSearchWorkerClient";
import { useEncryption } from "../context/useEncryption";
import { readLocalBookmarks } from "../lib/localVault";

export async function searchBookmarkLibrary(
  userId: string, cryptoKey: CryptoKey | null, isLocalAccount: boolean,
  query: string, options: { offset?: number; limit?: number; sorting?: BookmarkSorting } = {},
) {
  const normalized = query.trim();
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(1, Math.floor(options.limit ?? 100));
  if (!isLocalAccount) {
    return searchCachedBookmarksOffMainThread(userId, normalized, {
      offset,
      limit,
      sorting: options.sorting,
    });
  }
  const terms = normalized.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = (await readLocalBookmarks(userId, cryptoKey!)).filter(
    (bookmark) => {
      if (bookmark.is_highlight_source) return false;
      const haystack = [
        bookmark.title,
        bookmark.url,
        ...(bookmark.folders ?? []).map((folder) => folder.name),
        ...(bookmark.tags ?? []).map((tag) => tag.name),
      ].join(" ").toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
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
  options: { offset?: number; limit?: number; sorting?: BookmarkSorting } = {},
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
      offset,
      limit,
    ],
    queryFn: async () => {
      return searchBookmarkLibrary(user!.id, cryptoKey, isLocalAccount, normalized, { offset, limit, sorting: options.sorting });
    },
    enabled: Boolean(user?.id) && normalized.length > 0 &&
      (!isLocalAccount || !!cryptoKey),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });
}
