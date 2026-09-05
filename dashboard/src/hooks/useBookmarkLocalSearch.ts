import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { searchCachedBookmarksOffMainThread } from "../lib/bookmarkSearchWorkerClient";
import { useEncryption } from "../context/useEncryption";
import { readLocalBookmarks } from "../lib/localVault";

export function useBookmarkLocalSearch(
  query: string,
  options: { offset?: number; limit?: number } = {},
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
      offset,
      limit,
    ],
    queryFn: async () => {
      if (!isLocalAccount) {
        return searchCachedBookmarksOffMainThread(user!.id, normalized, {
          offset,
          limit,
        });
      }
      const terms = normalized.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const matches = (await readLocalBookmarks(user!.id, cryptoKey!)).filter(
        (bookmark) => {
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
        bookmarks: matches.slice(offset, offset + limit),
        total: matches.length,
        offset,
        limit,
      };
    },
    enabled: Boolean(user?.id) && normalized.length > 0 &&
      (!isLocalAccount || !!cryptoKey),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });
}
