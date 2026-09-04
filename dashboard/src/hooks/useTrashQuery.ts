import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import {
  emptyTrash,
  permanentlyDeleteTrashItem,
  restoreTrashItem,
  type TrashItem,
} from "../lib/trashRepository";
import { invalidateEntryQueries } from "./useEntriesQuery";
import { RESOURCE_USAGE_QUERY_KEY } from "./useResourceUsageQuery";
import { getCachedTrashForUser } from "../lib/bookmarkCache";

export const TRASH_QUERY_KEY = ["trash"] as const;

export type DecryptedTrashItem = Omit<
  TrashItem,
  "encryptedTitle" | "encryptedUrl"
> & {
  title: string;
  url: string | null;
};

function invalidateLibraryQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: TRASH_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
  queryClient.invalidateQueries({ queryKey: ["folders"] });
  queryClient.invalidateQueries({ queryKey: ["tags"] });
  queryClient.invalidateQueries({ queryKey: ["highlights"] });
  queryClient.invalidateQueries({ queryKey: ["account-plan"] });
  queryClient.invalidateQueries({ queryKey: RESOURCE_USAGE_QUERY_KEY });
  invalidateEntryQueries(queryClient);
}

export function useTrash() {
  const { user, bookmarkCacheSyncedAt } = useAuth();
  return useQuery({
    queryKey: [...TRASH_QUERY_KEY, user?.id],
    enabled: !!user && !!bookmarkCacheSyncedAt,
    queryFn: async () => {
      const now = Date.now();
      return (await getCachedTrashForUser(user!.id))
        .filter((item) => new Date(item.expiresAt).getTime() > now)
        .sort((left, right) => right.deletedAt.localeCompare(left.deletedAt));
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useTrashCount() {
  const { user, bookmarkCacheSyncedAt } = useAuth();
  return useQuery({
    queryKey: [...TRASH_QUERY_KEY, "count", user?.id],
    enabled: !!user && !!bookmarkCacheSyncedAt,
    queryFn: async () => {
      const now = Date.now();
      return (await getCachedTrashForUser(user!.id)).filter(
        (item) => new Date(item.expiresAt).getTime() > now,
      ).length;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useRestoreTrashItem() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session } = useAuth();
  return useMutation({
    mutationFn: (trashId: string) => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return restoreTrashItem(session.access_token, trashId);
    },
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateLibraryQueries(queryClient);
    },
  });
}

export function usePermanentlyDeleteTrashItem() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session } = useAuth();
  return useMutation({
    mutationFn: (trashId: string) => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return permanentlyDeleteTrashItem(session.access_token, trashId);
    },
    onSuccess: () => {
      retryBookmarkCacheSync();
      queryClient.invalidateQueries({ queryKey: TRASH_QUERY_KEY });
    },
  });
}

export function useEmptyTrash() {
  const { session, retryBookmarkCacheSync } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!session?.access_token) {
        throw new Error("You must be signed in to empty Trash.");
      }
      return emptyTrash(session.access_token);
    },
    onSuccess: () => {
      retryBookmarkCacheSync();
      queryClient.invalidateQueries({ queryKey: TRASH_QUERY_KEY });
    },
  });
}
