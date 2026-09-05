import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { getCachedBookmarksForUser } from "../lib/bookmarkCache";
import { useEncryption } from "../context/useEncryption";
import { readLocalBookmarks } from "../lib/localVault";

export function useCachedBookmarks(enabled = true) {
  const { user, bookmarkCacheSyncedAt, isLocalAccount } = useAuth();
  const { cryptoKey } = useEncryption();

  return useQuery({
    queryKey: ["bookmarks", "local-cache", user?.id],
    queryFn: () => isLocalAccount
      ? readLocalBookmarks(user!.id, cryptoKey!)
      : getCachedBookmarksForUser(user!.id),
    enabled:
      enabled && !!user && !!bookmarkCacheSyncedAt &&
      (!isLocalAccount || !!cryptoKey),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
}
