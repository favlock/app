import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEntry,
  deleteEntry,
  updateEntry,
  type EntryWriteValues,
} from "../lib/entryRepository";
import type { Note } from "../types/bookmark";
import { invalidateEntryQueries } from "./useEntriesQuery";
import { useAuth } from "../context/useAuth";
import { getCachedEntriesForUser } from "../lib/bookmarkCache";
import { useEncryption } from "../context/useEncryption";
import {
  createLocalEntry,
  deleteLocalEntry,
  readLocalEntries,
  updateLocalEntry,
} from "../lib/localVault";

const NOTES_QUERY_KEY = ["notes"];

export function useNotes(options?: { enabled?: boolean }) {
  const { user, bookmarkCacheSyncedAt, isLocalAccount } = useAuth();
  const { cryptoKey } = useEncryption();
  return useQuery({
    queryKey: [...NOTES_QUERY_KEY, user?.id],
    enabled: (options?.enabled ?? true) && !!user && !!bookmarkCacheSyncedAt && (!isLocalAccount || !!cryptoKey),
    queryFn: async () => {
      const entries = isLocalAccount
        ? await readLocalEntries(user!.id, cryptoKey!)
        : await getCachedEntriesForUser(user!.id);
      return entries
        .filter((entry): entry is Note => entry.kind === "note")
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
}

export function useNoteCount() {
  const { user, bookmarkCacheSyncedAt, isLocalAccount } = useAuth();
  const { cryptoKey } = useEncryption();
  return useQuery({
    queryKey: [...NOTES_QUERY_KEY, "count", user?.id],
    enabled: !!user && !!bookmarkCacheSyncedAt && (!isLocalAccount || !!cryptoKey),
    queryFn: async () =>
      (isLocalAccount
        ? await readLocalEntries(user!.id, cryptoKey!)
        : await getCachedEntriesForUser(user!.id)).filter(
        (entry) => entry.kind === "note",
      ).length,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();

  return useMutation({
    mutationFn: (values: EntryWriteValues) => isLocalAccount
      ? createLocalEntry(user!.id, "note", values)
      : createEntry(session?.access_token ?? "", "note", values),
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();

  return useMutation({
    mutationFn: ({ noteId, ...values }: EntryWriteValues & { noteId: string }) => isLocalAccount
      ? updateLocalEntry(user!.id, noteId, values)
      : updateEntry(session?.access_token ?? "", noteId, values),
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();

  return useMutation({
    mutationFn: (noteId: string) => isLocalAccount
      ? deleteLocalEntry(user!.id, noteId)
      : deleteEntry(session?.access_token ?? "", "note", noteId),
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}
