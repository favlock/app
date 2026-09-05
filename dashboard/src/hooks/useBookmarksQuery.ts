import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { getCachedBookmarksForUser } from "../lib/bookmarkCache";
import {
  createBookmark,
  moveBookmarkToFolder,
  setBookmarkFavorite,
  trashBookmark,
  updateBookmark,
} from "../lib/bookmarkRepository";
import { bookmarksForView, type BookmarkView } from "../lib/bookmarkViews";
import { RESOURCE_USAGE_QUERY_KEY } from "./useResourceUsageQuery";
import { setLibraryPopulated } from "../lib/onboarding";
import { useEncryption } from "../context/useEncryption";
import {
  createLocalBookmark,
  deleteLocalBookmark,
  favoriteLocalBookmark,
  moveLocalBookmark,
  readLocalBookmarks,
  updateLocalBookmark,
} from "../lib/localVault";

const BOOKMARKS_QUERY_KEY = ["bookmarks"];
const TAG_IDS_QUERY_KEY_PREFIX = "tag-bookmark-ids";

function bookmarkView(folderId: string | null): BookmarkView {
  if (folderId === "favorites") return { kind: "favorites" };
  if (folderId === "unsorted") return { kind: "unsorted" };
  if (folderId) return { kind: "folder", id: folderId };
  return { kind: "all" };
}

export const useBookmarkCounts = () => {
  const { user, bookmarkCacheSyncedAt, isLocalAccount } = useAuth();
  const { cryptoKey } = useEncryption();
  return useQuery({
    queryKey: [...BOOKMARKS_QUERY_KEY, "counts", user?.id],
    enabled: !!user && !!bookmarkCacheSyncedAt && (!isLocalAccount || !!cryptoKey),
    queryFn: async () => {
      const bookmarks = isLocalAccount
        ? await readLocalBookmarks(user!.id, cryptoKey!)
        : await getCachedBookmarksForUser(user!.id);
      return {
        bookmarkCount: bookmarks.length,
        favoriteCount: bookmarks.filter((bookmark) => bookmark.is_favorite)
          .length,
        unsortedCount: bookmarks.filter(
          (bookmark) => (bookmark.folders ?? []).length === 0,
        ).length,
      };
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
};

export const useBookmarks = (
  folderId: string | null = null,
  options?: { enabled?: boolean },
) => {
  const { user, bookmarkCacheSyncedAt, isLocalAccount } = useAuth();
  const { cryptoKey } = useEncryption();
  return useQuery({
    queryKey: [
      ...BOOKMARKS_QUERY_KEY,
      "local-view",
      folderId,
      user?.id,
      bookmarkCacheSyncedAt,
    ],
    enabled:
      (options?.enabled ?? true) && !!user && !!bookmarkCacheSyncedAt &&
      (!isLocalAccount || !!cryptoKey),
    queryFn: async () =>
      bookmarksForView(
        isLocalAccount
          ? await readLocalBookmarks(user!.id, cryptoKey!)
          : await getCachedBookmarksForUser(user!.id),
        bookmarkView(folderId),
      ),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
};

export const useAddBookmark = () => {
  const queryClient = useQueryClient();
  const { session, user, retryBookmarkCacheSync, isLocalAccount } = useAuth();

  return useMutation({
    mutationFn: async ({
      title,
      url,
      folderId,
      existingTagIds,
      newEncryptedTagNames,
    }: {
      title: string;
      url: string;
      folderId: string | null;
      existingTagIds: string[];
      newEncryptedTagNames: string[];
    }) => {
      if (!user) throw new Error("Open a FavLock vault before saving.");
      return isLocalAccount
        ? createLocalBookmark(user.id, {
            encryptedTitle: title,
            encryptedUrl: url,
            folderId,
            existingTagIds,
            newEncryptedTagNames,
          })
        : createBookmark(session?.access_token ?? "", {
            title,
            url,
            folderId,
            existingTagIds,
            newEncryptedTagNames,
          });
    },
    onSuccess: () => {
      if (user?.id) setLibraryPopulated(user.id, true);
      retryBookmarkCacheSync();
      queryClient.invalidateQueries({ queryKey: BOOKMARKS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: [TAG_IDS_QUERY_KEY_PREFIX] });
    },
  });
};

export const useDeleteBookmark = () => {
  const queryClient = useQueryClient();
  const { session, retryBookmarkCacheSync, user, isLocalAccount } = useAuth();

  return useMutation({
    mutationFn: (bookmarkId: string) => {
      if (!user) throw new Error("Open a FavLock vault before deleting.");
      return isLocalAccount
        ? deleteLocalBookmark(user.id, bookmarkId)
        : trashBookmark(session?.access_token ?? "", bookmarkId);
    },
    onSuccess: () => {
      retryBookmarkCacheSync();
      queryClient.invalidateQueries({ queryKey: BOOKMARKS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [TAG_IDS_QUERY_KEY_PREFIX] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: RESOURCE_USAGE_QUERY_KEY });
    },
  });
};

export const useToggleFavorite = () => {
  const queryClient = useQueryClient();
  const { session, retryBookmarkCacheSync, user, isLocalAccount } = useAuth();

  return useMutation({
    mutationFn: ({
      bookmarkId,
      isFavorite,
    }: {
      bookmarkId: string;
      isFavorite: boolean;
    }) => {
      if (!user) throw new Error("Open a FavLock vault before updating.");
      return isLocalAccount
        ? favoriteLocalBookmark(user.id, bookmarkId, isFavorite)
        : setBookmarkFavorite(
            session?.access_token ?? "",
            bookmarkId,
            isFavorite,
          );
    },
    onSuccess: () => {
      retryBookmarkCacheSync();
      queryClient.invalidateQueries({ queryKey: BOOKMARKS_QUERY_KEY });
    },
  });
};

export const useUpdateBookmark = () => {
  const queryClient = useQueryClient();
  const { session, retryBookmarkCacheSync, user, isLocalAccount } = useAuth();

  return useMutation({
    mutationFn: async ({
      bookmarkId,
      title,
      folderId,
      existingTagIds,
      newEncryptedTagNames,
    }: {
      bookmarkId: string;
      title: string;
      folderId: string | null;
      existingTagIds: string[];
      newEncryptedTagNames: string[];
    }) => {
      if (!user) throw new Error("Open a FavLock vault before updating.");
      return isLocalAccount
        ? updateLocalBookmark(user.id, bookmarkId, {
            encryptedTitle: title,
            folderId,
            existingTagIds,
            newEncryptedTagNames,
          })
        : updateBookmark(session?.access_token ?? "", bookmarkId, {
            title,
            folderId,
            existingTagIds,
            newEncryptedTagNames,
          });
    },
    onSuccess: () => {
      retryBookmarkCacheSync();
      queryClient.invalidateQueries({ queryKey: BOOKMARKS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: [TAG_IDS_QUERY_KEY_PREFIX] });
    },
  });
};

export const useMoveBookmark = () => {
  const queryClient = useQueryClient();
  const { session, retryBookmarkCacheSync, user, isLocalAccount } = useAuth();

  return useMutation({
    mutationFn: ({
      bookmarkId,
      folderId,
    }: {
      bookmarkId: string;
      folderId: string | null;
    }) => {
      if (!user) throw new Error("Open a FavLock vault before updating.");
      return isLocalAccount
        ? moveLocalBookmark(user.id, bookmarkId, folderId)
        : moveBookmarkToFolder(
            session?.access_token ?? "",
            bookmarkId,
            folderId,
          );
    },
    onSuccess: () => {
      retryBookmarkCacheSync();
      queryClient.invalidateQueries({ queryKey: BOOKMARKS_QUERY_KEY });
    },
  });
};
