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

const BOOKMARKS_QUERY_KEY = ["bookmarks"];
const TAG_IDS_QUERY_KEY_PREFIX = "tag-bookmark-ids";

function bookmarkView(folderId: string | null): BookmarkView {
  if (folderId === "favorites") return { kind: "favorites" };
  if (folderId === "unsorted") return { kind: "unsorted" };
  if (folderId) return { kind: "folder", id: folderId };
  return { kind: "all" };
}

export const useBookmarkCounts = () => {
  const { user, bookmarkCacheSyncedAt } = useAuth();
  return useQuery({
    queryKey: [...BOOKMARKS_QUERY_KEY, "counts", user?.id],
    enabled: !!user && !!bookmarkCacheSyncedAt,
    queryFn: async () => {
      const bookmarks = (await getCachedBookmarksForUser(user!.id)).filter(
        (bookmark) => !bookmark.is_highlight_source,
      );
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
  options?: { enabled?: boolean; includeHighlightSources?: boolean },
) => {
  const { user, bookmarkCacheSyncedAt } = useAuth();
  return useQuery({
    queryKey: [
      ...BOOKMARKS_QUERY_KEY,
      "local-view",
      folderId,
      user?.id,
      bookmarkCacheSyncedAt,
      options?.includeHighlightSources ? "with-highlight-sources" : "visible-only",
    ],
    enabled:
      (options?.enabled ?? true) && !!user && !!bookmarkCacheSyncedAt,
    queryFn: async () => {
      const bookmarks = await getCachedBookmarksForUser(user!.id);
      if (options?.includeHighlightSources) {
        return [...bookmarks].sort((left, right) =>
          right.created_at.localeCompare(left.created_at),
        );
      }
      return bookmarksForView(bookmarks, bookmarkView(folderId));
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
};

export const useAddBookmark = () => {
  const queryClient = useQueryClient();
  const { session, user, retryBookmarkCacheSync } = useAuth();

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
    }) =>
      createBookmark(session?.access_token ?? "", {
        title,
        url,
        folderId,
        existingTagIds,
        newEncryptedTagNames,
      }),
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
  const { session, retryBookmarkCacheSync } = useAuth();

  return useMutation({
    mutationFn: (bookmarkId: string) =>
      trashBookmark(session?.access_token ?? "", bookmarkId),
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
  const { session, retryBookmarkCacheSync } = useAuth();

  return useMutation({
    mutationFn: ({
      bookmarkId,
      isFavorite,
    }: {
      bookmarkId: string;
      isFavorite: boolean;
    }) =>
      setBookmarkFavorite(
        session?.access_token ?? "",
        bookmarkId,
        isFavorite,
      ),
    onSuccess: () => {
      retryBookmarkCacheSync();
      queryClient.invalidateQueries({ queryKey: BOOKMARKS_QUERY_KEY });
    },
  });
};

export const useUpdateBookmark = () => {
  const queryClient = useQueryClient();
  const { session, retryBookmarkCacheSync } = useAuth();

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
    }) =>
      updateBookmark(session?.access_token ?? "", bookmarkId, {
        title,
        folderId,
        existingTagIds,
        newEncryptedTagNames,
      }),
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
  const { session, retryBookmarkCacheSync } = useAuth();

  return useMutation({
    mutationFn: ({
      bookmarkId,
      folderId,
    }: {
      bookmarkId: string;
      folderId: string | null;
    }) =>
      moveBookmarkToFolder(
        session?.access_token ?? "",
        bookmarkId,
        folderId,
      ),
    onSuccess: () => {
      retryBookmarkCacheSync();
      queryClient.invalidateQueries({ queryKey: BOOKMARKS_QUERY_KEY });
    },
  });
};
