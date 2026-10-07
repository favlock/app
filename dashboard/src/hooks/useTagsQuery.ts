import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '../context/useAuth';
import { useEncryption } from '../context/useEncryption';
import type { Tag } from '../types/bookmark';
import { countRelations } from '../lib/relationCounts';
import {
  getCachedBookmarksForUser,
  getCachedEntriesForUser,
  getCachedTagsForUser,
} from '../lib/bookmarkCache';
import { arrangeTags, deleteTag, updateTag } from '../lib/taxonomyRepository';
import {
  arrangeLocalTags,
  deleteLocalTag,
  readLocalBookmarks,
  readLocalEntries,
  readLocalTags,
  updateLocalTag,
} from '../lib/localVault';

const TAGS_QUERY_KEY = ['tags'];

export const useTagBookmarkCounts = () => {
  const { user, bookmarkCacheSyncedAt, isLocalAccount } = useAuth();
  const { cryptoKey } = useEncryption();
  return useQuery({
    queryKey: ['bookmarks', 'tagCounts', user?.id],
    enabled: !!user && !!bookmarkCacheSyncedAt && (!isLocalAccount || !!cryptoKey),
    queryFn: async () => {
      const [bookmarks, entries] = isLocalAccount
        ? await Promise.all([
            readLocalBookmarks(user!.id, cryptoKey!),
            readLocalEntries(user!.id, cryptoKey!),
          ])
        : await Promise.all([
            getCachedBookmarksForUser(user!.id),
            getCachedEntriesForUser(user!.id),
          ]);
      const relationIds = [
        ...bookmarks.filter((bookmark) => !bookmark.is_highlight_source).flatMap((bookmark) =>
          (bookmark.tags ?? []).map((tag) => tag.id),
        ),
        ...entries.flatMap((entry) =>
          (entry.tags ?? []).map((tag) => tag.id),
        ),
      ];
      return countRelations(relationIds);
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
};

export const useDeleteTag = () => {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();

  return useMutation({
    mutationFn: (tagId: string) => {
      if (!user) throw new Error('Open a FavLock vault before deleting.');
      return isLocalAccount
        ? deleteLocalTag(user.id, tagId)
        : deleteTag(session?.access_token ?? '', tagId);
    },
    onSuccess: () => {
      retryBookmarkCacheSync();
      queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['readspace'] });
    },
  });
};

export type TagPlacement = { id: string; sortOrder: number };

export const useReorderTags = () => {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();

  return useMutation({
    scope: { id: 'tag-reorder' },
    mutationFn: (placements: TagPlacement[]) => {
      if (!user) throw new Error('Open a FavLock vault before updating.');
      return isLocalAccount
        ? arrangeLocalTags(user.id, placements)
        : arrangeTags(session?.access_token ?? '', placements);
    },
    onMutate: async (placements) => {
      await queryClient.cancelQueries({ queryKey: TAGS_QUERY_KEY });
      const previousQueries = queryClient.getQueriesData<Tag[]>({
        queryKey: TAGS_QUERY_KEY,
      });
      const sortOrderById = new Map(
        placements.map(({ id, sortOrder }) => [id, sortOrder]),
      );
      queryClient.setQueriesData<Tag[]>({ queryKey: TAGS_QUERY_KEY }, (old) =>
        old?.map((tag) =>
          sortOrderById.has(tag.id)
            ? { ...tag, sort_order: sortOrderById.get(tag.id) }
            : tag,
        ),
      );
      return { previousQueries };
    },
    onError: (_error, _placements, context) => {
      context?.previousQueries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
    },
    onSuccess: retryBookmarkCacheSync,
  });
};

export const useUpdateTag = () => {
  const queryClient = useQueryClient();
  const { encryptField } = useEncryption();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();

  return useMutation({
    mutationFn: async ({ tagId, name }: { tagId: string; name: string }) => {
      if (!user) throw new Error('Open a FavLock vault before updating.');
      const encryptedName = await encryptField(name);
      if (isLocalAccount) {
        await updateLocalTag(user.id, tagId, encryptedName);
      } else {
        await updateTag(session?.access_token ?? '', tagId, encryptedName);
      }
    },
    onSuccess: () => {
      retryBookmarkCacheSync();
      queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['readspace'] });
    },
  });
};

export const useTags = () => {
  const { user, bookmarkCacheSyncedAt, isLocalAccount } = useAuth();
  const { cryptoKey } = useEncryption();
  return useQuery<Tag[]>({
    queryKey: [...TAGS_QUERY_KEY, user?.id],
    enabled: !!user && !!bookmarkCacheSyncedAt && (!isLocalAccount || !!cryptoKey),
    queryFn: async () =>
      (isLocalAccount
        ? await readLocalTags(user!.id, cryptoKey!)
        : await getCachedTagsForUser(user!.id)).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
};
