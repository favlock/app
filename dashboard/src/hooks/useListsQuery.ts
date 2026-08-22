import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import {
  addListItem,
  createEncryptedList,
  deleteEncryptedList,
  fetchEncryptedLists,
  removeListItem,
  reorderListItems,
  setBookmarkLists,
  setListItemCompleted,
  updateEncryptedList,
} from "../lib/listRepository";
import type { BookmarkList } from "../types/bookmark";
import {
  RESOURCE_USAGE_QUERY_KEY,
  useResourceUsage,
} from "./useResourceUsageQuery";

const LISTS_QUERY_KEY = ["lists"];

export function useLists(options?: { enabled?: boolean }) {
  const { user, session } = useAuth();
  const { cryptoKey, decryptField, keyLoading, triggerUnlock } = useEncryption();
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (enabled && user && !cryptoKey && !keyLoading) triggerUnlock();
  }, [cryptoKey, enabled, keyLoading, triggerUnlock, user]);

  return useQuery<BookmarkList[]>({
    queryKey: [...LISTS_QUERY_KEY, user?.id],
    enabled:
      enabled &&
      !!user &&
      !!session?.access_token &&
      !!cryptoKey,
    queryFn: async () => {
      if (!user || !session?.access_token) {
        throw new Error("Please sign in again before continuing.");
      }
      const lists = await fetchEncryptedLists(session.access_token);
      return Promise.all(
        lists.map(async (list): Promise<BookmarkList> => ({
          id: list.id,
          user_id: user.id,
          name: await decryptField(list.encryptedName),
          created_at: list.createdAt,
          updated_at: list.updatedAt,
          items: await Promise.all(
            list.items.map(async (item) => ({
              position: item.position,
              completed_at: item.completedAt,
              created_at: item.createdAt,
              bookmark: {
                id: item.bookmarkId,
                user_id: user.id,
                title: await decryptField(item.encryptedTitle),
                url: await decryptField(item.encryptedUrl),
                created_at: item.bookmarkCreatedAt,
                is_favorite: item.isFavorite,
                favorited_at: item.favoritedAt,
              },
            })),
          ),
        })),
      );
    },
    staleTime: 30_000,
  });
}

function useAccessToken(): string {
  return useAuth().session?.access_token ?? "";
}

function useInvalidateLists(includeResourceUsage = false) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
    if (includeResourceUsage) {
      void queryClient.invalidateQueries({ queryKey: RESOURCE_USAGE_QUERY_KEY });
    }
  };
}

export function useCreateList() {
  const accessToken = useAccessToken();
  const { encryptField } = useEncryption();
  const invalidate = useInvalidateLists(true);
  return useMutation({
    mutationFn: async (name: string) => {
      const cleanName = name.trim();
      if (!cleanName) throw new Error("Enter a List name.");
      return createEncryptedList(
        accessToken,
        await encryptField(cleanName),
      );
    },
    onSuccess: invalidate,
  });
}

export function useRenameList() {
  const accessToken = useAccessToken();
  const { encryptField } = useEncryption();
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: async ({ listId, name }: { listId: string; name: string }) => {
      const cleanName = name.trim();
      if (!cleanName) throw new Error("Enter a List name.");
      await updateEncryptedList(
        accessToken,
        listId,
        await encryptField(cleanName),
      );
    },
    onSuccess: invalidate,
  });
}

export function useDeleteList() {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateLists(true);
  return useMutation({
    mutationFn: (listId: string) => deleteEncryptedList(accessToken, listId),
    onSuccess: invalidate,
  });
}

export function useToggleListItem() {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: ({
      listId,
      bookmarkId,
      completed,
    }: {
      listId: string;
      bookmarkId: string;
      completed: boolean;
    }) => setListItemCompleted(
      accessToken,
      listId,
      bookmarkId,
      completed,
    ),
    onSuccess: invalidate,
  });
}

export function useRemoveListItem() {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: ({
      listId,
      bookmarkId,
    }: {
      listId: string;
      bookmarkId: string;
    }) => removeListItem(accessToken, listId, bookmarkId),
    onSuccess: invalidate,
  });
}

export function useAddBookmarkToList() {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: ({
      listId,
      bookmarkId,
    }: {
      listId: string;
      bookmarkId: string;
    }) => addListItem(accessToken, listId, bookmarkId),
    onSuccess: invalidate,
  });
}

export function useSetBookmarkLists() {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: ({
      bookmarkId,
      listIds,
    }: {
      bookmarkId: string;
      listIds: string[];
    }) => setBookmarkLists(accessToken, bookmarkId, listIds),
    onSuccess: invalidate,
  });
}

export function useReorderListItems() {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: ({
      listId,
      bookmarkIds,
    }: {
      listId: string;
      bookmarkIds: string[];
    }) => reorderListItems(accessToken, listId, bookmarkIds),
    onSuccess: invalidate,
  });
}

export function useListCount() {
  const usage = useResourceUsage();
  return { ...usage, data: usage.data?.lists };
}
