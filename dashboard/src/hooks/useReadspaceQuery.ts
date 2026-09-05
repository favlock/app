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
import { useEncryption } from "../context/useEncryption";
import {
  createLocalEntry,
  deleteLocalEntry,
  readLocalEntries,
  updateLocalReadspaceOrganization,
} from "../lib/localVault";

const READSPACE_QUERY_KEY = ["readspace"] as const;
export function useReadspace(enabled = true) {
  const { user, bookmarkCacheSyncedAt, isLocalAccount } = useAuth();
  const { cryptoKey } = useEncryption();
  return useQuery({
    queryKey: [...READSPACE_QUERY_KEY, user?.id],
    enabled: enabled && !!user && !!bookmarkCacheSyncedAt && (!isLocalAccount || !!cryptoKey),
    queryFn: async () => {
      const entries = isLocalAccount
        ? await readLocalEntries(user!.id, cryptoKey!)
        : await getCachedEntriesForUser(user!.id);
      return entries
        .filter((entry): entry is ReadspaceEntry => entry.kind === "read")
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useReadspaceCount() {
  const { user, bookmarkCacheSyncedAt, isLocalAccount } = useAuth();
  const { cryptoKey } = useEncryption();
  return useQuery({
    queryKey: [
      ...READSPACE_QUERY_KEY,
      "count",
      user?.id,
    ],
    enabled: !!user && !!bookmarkCacheSyncedAt && (!isLocalAccount || !!cryptoKey),
    queryFn: async () =>
      (isLocalAccount
        ? await readLocalEntries(user!.id, cryptoKey!)
        : await getCachedEntriesForUser(user!.id)).filter(
        (entry) => entry.kind === "read",
      ).length,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useCreateReadspaceEntry() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();
  return useMutation({
    mutationFn: (values: Parameters<typeof createReadspaceEntry>[1]) => isLocalAccount
      ? createLocalEntry(user!.id, "read", values)
      : createReadspaceEntry(session?.access_token ?? "", values),
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}

export function useDeleteReadspaceEntry() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();
  return useMutation({
    mutationFn: (entryId: string) => isLocalAccount
      ? deleteLocalEntry(user!.id, entryId)
      : deleteEntry(session?.access_token ?? "", "read", entryId),
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}

export function useUpdateReadspaceOrganization() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();
  return useMutation({
    mutationFn: (
      values: Parameters<typeof updateReadspaceOrganization>[1],
    ) => isLocalAccount
      ? updateLocalReadspaceOrganization(user!.id, values)
      : updateReadspaceOrganization(session?.access_token ?? "", values),
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}
