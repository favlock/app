import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { searchCachedBookmarksOffMainThread } from "../lib/bookmarkSearchWorkerClient";

export function useBookmarkLocalSearch(
  query: string,
  options: { offset?: number; limit?: number } = {},
) {
  const { user } = useAuth();
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
    queryFn: () =>
      searchCachedBookmarksOffMainThread(user!.id, normalized, {
        offset,
        limit,
      }),
    enabled: Boolean(user?.id) && normalized.length > 0,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });
}
