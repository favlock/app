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

const NOTES_QUERY_KEY = ["notes"];

export function useNotes(options?: { enabled?: boolean }) {
  const { user, bookmarkCacheSyncedAt } = useAuth();
  return useQuery({
    queryKey: [...NOTES_QUERY_KEY, user?.id],
    enabled: (options?.enabled ?? true) && !!user && !!bookmarkCacheSyncedAt,
    queryFn: async () => {
      const entries = await getCachedEntriesForUser(user!.id);
      return entries
        .filter((entry): entry is Note => entry.kind === "note")
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
}

export function useNoteCount() {
  const { user, bookmarkCacheSyncedAt } = useAuth();
  return useQuery({
    queryKey: [...NOTES_QUERY_KEY, "count", user?.id],
    enabled: !!user && !!bookmarkCacheSyncedAt,
    queryFn: async () =>
      (await getCachedEntriesForUser(user!.id)).filter(
        (entry) => entry.kind === "note",
      ).length,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session } = useAuth();

  return useMutation({
    mutationFn: (values: EntryWriteValues) =>
      createEntry(session?.access_token ?? "", "note", values),
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session } = useAuth();

  return useMutation({
    mutationFn: ({ noteId, ...values }: EntryWriteValues & { noteId: string }) =>
      updateEntry(session?.access_token ?? "", noteId, values),
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session } = useAuth();

  return useMutation({
    mutationFn: (noteId: string) =>
      deleteEntry(session?.access_token ?? "", "note", noteId),
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}
