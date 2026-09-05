import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEncryption } from '../context/useEncryption';
import type { Folder } from '../types/bookmark';
import type { ColorConstant } from '../constants/colors';
import {
  applyFolderPlacements,
  sortFolders,
  type FolderPlacement,
} from '../lib/folderOrder';
import { countRelations } from '../lib/relationCounts';
import { useAuth } from '../context/useAuth';
import {
  getCachedBookmarksForUser,
  getCachedEntriesForUser,
  getCachedFoldersForUser,
} from '../lib/bookmarkCache';
import {
  arrangeFolders,
  createFolder,
  deleteFolder,
  updateFolder,
} from '../lib/taxonomyRepository';
import {
  arrangeLocalFolders,
  createLocalFolder,
  deleteLocalFolder,
  readLocalBookmarks,
  readLocalEntries,
  readLocalFolders,
  updateLocalFolder,
} from '../lib/localVault';

export type AddFolderInput = Pick<Folder, 'name'> & {
  color?: ColorConstant | null;
  parent_id?: string | null;
};

type UpdateFolderInput = {
  folderId: string;
  updates: {
    name?: string;
    color?: ColorConstant | null;
  };
};

const FOLDERS_QUERY_KEY = ['folders'];

export const useFolders = () => {
  const { user, bookmarkCacheSyncedAt, isLocalAccount } = useAuth();
  const { cryptoKey } = useEncryption();
  return useQuery({
    queryKey: [...FOLDERS_QUERY_KEY, user?.id],
    enabled: !!user && !!bookmarkCacheSyncedAt && (!isLocalAccount || !!cryptoKey),
    queryFn: async () => sortFolders(isLocalAccount
      ? await readLocalFolders(user!.id, cryptoKey!)
      : await getCachedFoldersForUser(user!.id)),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
};

export const useAddFolder = () => {
  const queryClient = useQueryClient();
  const { encryptField } = useEncryption();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();

  return useMutation({
    mutationFn: async (folder: AddFolderInput) => {
      const plainName = folder.name;
      const cachedFolders = queryClient
        .getQueriesData<Folder[]>({ queryKey: FOLDERS_QUERY_KEY })
        .find(([, data]) => data?.length)?.[1];
      const sortOrder = cachedFolders?.length
        ? Math.max(
            -1,
            ...cachedFolders
              .filter(
                (item) =>
                  item.parent_id === (folder.parent_id ?? null),
              )
              .map((item) => item.sort_order ?? 0),
          ) + 1
        : 0;
      if (!user) throw new Error('Not authenticated');
      const color = folder.color ?? null;
      const parentId = folder.parent_id ?? null;
      const input = {
        encryptedName: await encryptField(folder.name),
        color,
        parentId,
        sortOrder,
      };
      const localFolder = isLocalAccount
        ? await createLocalFolder(user.id, input)
        : null;
      const cloudFolder = isLocalAccount
        ? null
        : await createFolder(session?.access_token ?? '', input);

      return {
        id: localFolder?.id ?? cloudFolder!.folderId,
        user_id: user.id,
        name: plainName,
        color,
        parent_id: parentId,
        sort_order: sortOrder,
        created_at: localFolder?.created_at ?? cloudFolder!.createdAt,
      } satisfies Folder;
    },
    onSuccess: (newFolder) => {
      retryBookmarkCacheSync();
      // Keep all active folders queries in sync (e.g. ['folders', true])
      queryClient.setQueriesData(
        { queryKey: FOLDERS_QUERY_KEY },
        (old: Folder[] | undefined) => {
          if (!old) return [newFolder];
          return sortFolders([...old, newFolder]);
        },
      );
    },
  });
};

export const useReorderFolders = () => {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();

  return useMutation({
    scope: { id: 'folder-reorder' },
    mutationFn: (placements: FolderPlacement[]) => {
      if (!user) throw new Error('Open a FavLock vault before updating.');
      return isLocalAccount
        ? arrangeLocalFolders(user.id, placements)
        : arrangeFolders(session?.access_token ?? '', placements);
    },
    onMutate: async (placements) => {
      await queryClient.cancelQueries({ queryKey: FOLDERS_QUERY_KEY });
      const previousQueries = queryClient.getQueriesData<Folder[]>({
        queryKey: FOLDERS_QUERY_KEY,
      });

      queryClient.setQueriesData<Folder[]>(
        { queryKey: FOLDERS_QUERY_KEY },
        (old) => (old ? applyFolderPlacements(old, placements) : old),
      );

      return { previousQueries };
    },
    onError: (_error, _folderIds, context) => {
      context?.previousQueries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
    },
    onSuccess: retryBookmarkCacheSync,
  });
};

export const useUpdateFolder = () => {
  const queryClient = useQueryClient();
  const { encryptField } = useEncryption();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();

  return useMutation({
    mutationFn: async ({ folderId, updates }: UpdateFolderInput) => {
      const encryptedUpdates = {
        ...(updates.name !== undefined
          ? { encryptedName: await encryptField(updates.name) }
          : {}),
        ...(updates.color !== undefined ? { color: updates.color } : {}),
      };
      if (!user) throw new Error('Open a FavLock vault before updating.');
      if (isLocalAccount) {
        await updateLocalFolder(user.id, folderId, encryptedUpdates);
      } else {
        await updateFolder(session?.access_token ?? '', folderId, encryptedUpdates);
      }
    },
    onSuccess: () => {
      retryBookmarkCacheSync();
      queryClient.invalidateQueries({ queryKey: FOLDERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });
};

export const useDeleteFolder = () => {
  const queryClient = useQueryClient();
  const { retryBookmarkCacheSync, session, user, isLocalAccount } = useAuth();

  return useMutation({
    mutationFn: (folderId: string) => {
      if (!user) throw new Error('Open a FavLock vault before deleting.');
      return isLocalAccount
        ? deleteLocalFolder(user.id, folderId)
        : deleteFolder(session?.access_token ?? '', folderId);
    },
    onSuccess: () => {
      retryBookmarkCacheSync();
      queryClient.invalidateQueries({ queryKey: FOLDERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });
};

export const useFolderBookmarkCounts = () => {
  const { user, bookmarkCacheSyncedAt, isLocalAccount } = useAuth();
  const { cryptoKey } = useEncryption();
  return useQuery({
    queryKey: ['bookmarks', 'folderCounts', user?.id],
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
          (bookmark.folders ?? []).map((folder) => folder.id),
        ),
        ...entries.flatMap((entry) => (entry.folder ? [entry.folder.id] : [])),
      ];
      return countRelations(relationIds);
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 10,
  });
};
