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
import { deleteTag, updateTag } from '../lib/taxonomyRepository';

const TAGS_QUERY_KEY = ['tags'];

export const useTagBookmarkCounts = () => {
  const { user, bookmarkCacheSyncedAt } = useAuth();
  return useQuery({
    queryKey: ['bookmarks', 'tagCounts', user?.id],
    enabled: !!user && !!bookmarkCacheSyncedAt,
    queryFn: async () => {
      const [bookmarks, entries] = await Promise.all([
        getCachedBookmarksForUser(user!.id),
        getCachedEntriesForUser(user!.id),
      ]);
      const relationIds = [
        ...bookmarks.flatMap((bookmark) =>
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
  const { retryBookmarkCacheSync, session } = useAuth();

  return useMutation({
    mutationFn: (tagId: string) =>
      deleteTag(session?.access_token ?? '', tagId),
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

export const useUpdateTag = () => {
  const queryClient = useQueryClient();
  const { encryptField } = useEncryption();
  const { retryBookmarkCacheSync, session } = useAuth();

  return useMutation({
    mutationFn: async ({ tagId, name }: { tagId: string; name: string }) => {
      await updateTag(
        session?.access_token ?? '',
        tagId,
        await encryptField(name),
      );
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
  const { user, bookmarkCacheSyncedAt } = useAuth();
  return useQuery<Tag[]>({
    queryKey: [...TAGS_QUERY_KEY, user?.id],
    enabled: !!user && !!bookmarkCacheSyncedAt,
    queryFn: async () =>
      (await getCachedTagsForUser(user!.id)).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
};
