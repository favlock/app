import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { getCachedBookmarksForUser } from "../lib/bookmarkCache";

export function useCachedBookmarks(enabled = true) {
  const { user, bookmarkCacheSyncedAt } = useAuth();

  return useQuery({
    queryKey: ["bookmarks", "local-cache", user?.id],
    queryFn: () => getCachedBookmarksForUser(user!.id),
    enabled: enabled && !!user && !!bookmarkCacheSyncedAt,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
}
