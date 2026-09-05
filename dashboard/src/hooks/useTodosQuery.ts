import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEntry,
  deleteEntry,
  setTodoCompleted,
  updateTodo,
  type EntryWriteValues,
} from "../lib/entryRepository";
import type { Todo } from "../types/bookmark";
import { invalidateEntryQueries } from "./useEntriesQuery";
import { useAuth } from "../context/useAuth";
import { getCachedEntriesForUser } from "../lib/bookmarkCache";
import { useEncryption } from "../context/useEncryption";
import {
  createLocalEntry,
  deleteLocalEntry,
  readLocalEntries,
  setLocalTodoCompleted,
  updateLocalEntry,
} from "../lib/localVault";

const TODOS_QUERY_KEY = ["todos"];

export function useTodos(options?: { enabled?: boolean }) {
  const { user, bookmarkCacheSyncedAt, isLocalAccount } = useAuth();
  const { cryptoKey } = useEncryption();
  return useQuery({
    queryKey: [...TODOS_QUERY_KEY, user?.id],
    enabled: (options?.enabled ?? true) && !!user && !!bookmarkCacheSyncedAt && (!isLocalAccount || !!cryptoKey),
    queryFn: async () => {
      const entries = isLocalAccount
        ? await readLocalEntries(user!.id, cryptoKey!)
        : await getCachedEntriesForUser(user!.id);
      return entries
        .filter((entry): entry is Todo => entry.kind === "todo")
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
}

export function useTodoCount() {
  const { user, bookmarkCacheSyncedAt, isLocalAccount } = useAuth();
  const { cryptoKey } = useEncryption();
  return useQuery({
    queryKey: [...TODOS_QUERY_KEY, "count", user?.id],
    enabled: !!user && !!bookmarkCacheSyncedAt && (!isLocalAccount || !!cryptoKey),
    queryFn: async () =>
      (isLocalAccount
        ? await readLocalEntries(user!.id, cryptoKey!)
        : await getCachedEntriesForUser(user!.id)).filter(
        (entry) => entry.kind === "todo",
      ).length,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
}

export function useCreateTodo() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();
  return useMutation({
    mutationFn: (values: EntryWriteValues) => isLocalAccount
      ? createLocalEntry(user!.id, "todo", values)
      : createEntry(session?.access_token ?? "", "todo", values),
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}

export function useUpdateTodo() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();
  return useMutation({
    mutationFn: ({ todoId, ...values }: EntryWriteValues & { todoId: string }) => isLocalAccount
      ? updateLocalEntry(user!.id, todoId, values)
      : updateTodo(session?.access_token ?? "", todoId, values),
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}

export function useToggleTodo() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();
  return useMutation({
    mutationFn: ({ todoId, isCompleted }: { todoId: string; isCompleted: boolean }) => isLocalAccount
      ? setLocalTodoCompleted(user!.id, todoId, isCompleted)
      : setTodoCompleted(session?.access_token ?? "", todoId, isCompleted),
    onMutate: async ({ todoId, isCompleted }) => {
      await queryClient.cancelQueries({ queryKey: TODOS_QUERY_KEY });
      const previousQueries = queryClient.getQueriesData({
        queryKey: TODOS_QUERY_KEY,
      });

      for (const [queryKey, data] of previousQueries) {
        if (!Array.isArray(data)) continue;
        queryClient.setQueryData<Todo[]>(
          queryKey,
          data.map((todo: Todo) =>
            todo.id === todoId
              ? {
                  ...todo,
                  is_completed: isCompleted,
                  completed_at: isCompleted ? new Date().toISOString() : null,
                }
              : todo,
          ),
        );
      }

      return { previousQueries };
    },
    onError: (_error, _variables, context) => {
      for (const [queryKey, data] of context?.previousQueries ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSettled: (_data, error) => {
      if (!error) retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}

export function useDeleteTodo() {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();
  return useMutation({
    mutationFn: (todoId: string) => isLocalAccount
      ? deleteLocalEntry(user!.id, todoId)
      : deleteEntry(session?.access_token ?? "", "todo", todoId),
    onSuccess: () => {
      retryBookmarkCacheSync();
      invalidateEntryQueries(queryClient);
    },
  });
}
