import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { updateEntryFolder } from "../lib/entryRepository";
import { RESOURCE_USAGE_QUERY_KEY } from "./useResourceUsageQuery";
import { useAuth } from "../context/useAuth";
import { getCachedEntriesForUser } from "../lib/bookmarkCache";

export const ENTRIES_QUERY_KEY = ["entries"] as const;

export function useEntryCount() {
  const { user, bookmarkCacheSyncedAt } = useAuth();
  return useQuery({
    queryKey: [...ENTRIES_QUERY_KEY, "count", user?.id],
    enabled: !!user && !!bookmarkCacheSyncedAt,
    queryFn: async () => {
      return (await getCachedEntriesForUser(user!.id)).filter(
        (entry) => entry.kind === "note" || entry.kind === "todo",
      ).length;
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
}

export function useUpdateEntryFolder() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session } = useAuth();
  return useMutation({
    mutationFn: (values: Parameters<typeof updateEntryFolder>[1]) =>
      updateEntryFolder(session?.access_token ?? "", values),
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}

export function invalidateEntryQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["notes"] });
  queryClient.invalidateQueries({ queryKey: ["todos"] });
  queryClient.invalidateQueries({ queryKey: ["readspace"] });
  queryClient.invalidateQueries({ queryKey: ENTRIES_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: ["tags"] });
  queryClient.invalidateQueries({ queryKey: ["bookmarks", "folderCounts"] });
  queryClient.invalidateQueries({ queryKey: ["bookmarks", "tagCounts"] });
  queryClient.invalidateQueries({ queryKey: RESOURCE_USAGE_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: ["trash"] });
}
