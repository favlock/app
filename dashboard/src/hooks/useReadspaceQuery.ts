import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createReadspaceEntry,
  deleteEntry,
  updateReadspaceOrganization,
} from "../lib/entryRepository";
import type { ReadspaceEntry } from "../types/bookmark";
import { invalidateEntryQueries } from "./useEntriesQuery";
import { useAuth } from "../context/useAuth";
import { getCachedEntriesForUser } from "../lib/bookmarkCache";

const READSPACE_QUERY_KEY = ["readspace"] as const;
const CLOUD_ONLY_MESSAGE = "Readspace is available with a cloud account.";

function requireCloudAccess(isLocalAccount: boolean): void {
  if (isLocalAccount) throw new Error(CLOUD_ONLY_MESSAGE);
}

export function useReadspace(enabled = true) {
  const { user, bookmarkCacheSyncedAt, isLocalAccount } = useAuth();
  return useQuery({
    queryKey: [...READSPACE_QUERY_KEY, user?.id],
    enabled: enabled && !!user && !!bookmarkCacheSyncedAt && !isLocalAccount,
    queryFn: async () => {
      const entries = await getCachedEntriesForUser(user!.id);
      return entries
        .filter((entry): entry is ReadspaceEntry => entry.kind === "read")
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useReadspaceCount() {
  const { user, bookmarkCacheSyncedAt, isLocalAccount } = useAuth();
  return useQuery({
    queryKey: [
      ...READSPACE_QUERY_KEY,
      "count",
      user?.id,
    ],
    enabled: !!user && !!bookmarkCacheSyncedAt && !isLocalAccount,
    queryFn: async () =>
      (await getCachedEntriesForUser(user!.id)).filter(
        (entry) => entry.kind === "read",
      ).length,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useCreateReadspaceEntry() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, isLocalAccount } = useAuth();
  return useMutation({
    mutationFn: (values: Parameters<typeof createReadspaceEntry>[1]) => {
      requireCloudAccess(isLocalAccount);
      return createReadspaceEntry(session?.access_token ?? "", values);
    },
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}

export function useDeleteReadspaceEntry() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, isLocalAccount } = useAuth();
  return useMutation({
    mutationFn: (entryId: string) => {
      requireCloudAccess(isLocalAccount);
      return deleteEntry(session?.access_token ?? "", "read", entryId);
    },
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}

export function useUpdateReadspaceOrganization() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, isLocalAccount } = useAuth();
  return useMutation({
    mutationFn: (
      values: Parameters<typeof updateReadspaceOrganization>[1],
    ) => {
      requireCloudAccess(isLocalAccount);
      return updateReadspaceOrganization(session?.access_token ?? "", values);
    },
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}
