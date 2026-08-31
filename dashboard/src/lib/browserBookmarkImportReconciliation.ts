import type { Bookmark, Folder } from "../types/bookmark";
import {
  folderPathKey,
  getExistingFolderIdByPath,
  normalizeImportedBookmarkUrl,
  type ExistingImportFolder,
} from "./browserBookmarkImport";
import type { PreparedBrowserBookmarkImportItem } from "./browserBookmarkImportPlan";
import {
  fetchEncryptedLibraryBookmarks,
  fetchEncryptedLibraryFolders,
} from "./libraryContentApi";

type Decrypt = (value: string) => Promise<string>;
const DECRYPT_BATCH_SIZE = 100;

async function mapBatches<T, R>(
  values: T[],
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const result: R[] = [];
  for (let offset = 0; offset < values.length; offset += DECRYPT_BATCH_SIZE) {
    result.push(
      ...(await Promise.all(
        values.slice(offset, offset + DECRYPT_BATCH_SIZE).map(mapper),
      )),
    );
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  return result;
}

export async function loadAuthoritativeImportLibrary(
  accessToken: string,
  userId: string,
  decrypt: Decrypt,
): Promise<{ bookmarks: Bookmark[]; folders: Folder[] }> {
  const [encryptedBookmarks, encryptedFolders] = await Promise.all([
    fetchEncryptedLibraryBookmarks(accessToken),
    fetchEncryptedLibraryFolders(accessToken),
  ]);
  const folders = await mapBatches(encryptedFolders, async (folder) => ({
    id: folder.id,
    user_id: userId,
    name: await decrypt(folder.encryptedName),
    color: folder.color,
    parent_id: folder.parentId,
    sort_order: folder.sortOrder,
    created_at: folder.createdAt,
  }));
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const bookmarks = await mapBatches(encryptedBookmarks, async (bookmark) => ({
    id: bookmark.id,
    user_id: userId,
    title: await decrypt(bookmark.encryptedTitle),
    url: await decrypt(bookmark.encryptedUrl),
    created_at: bookmark.createdAt,
    is_favorite: bookmark.isFavorite,
    favorited_at: bookmark.favoritedAt,
    folders: bookmark.folders
      .map((folder) => foldersById.get(folder.id))
      .filter((folder): folder is Folder => Boolean(folder)),
    tags: [],
  }));
  return { bookmarks, folders };
}

function bookmarkFolderPath(
  bookmark: Bookmark,
  folders: Folder[],
): string[] {
  const attached = bookmark.folders?.[0];
  if (!attached) return [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path = [attached.name];
  let parentId = attached.parent_id;
  const visited = new Set([attached.id]);
  while (parentId) {
    if (visited.has(parentId)) return [];
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return [];
    path.unshift(parent.name);
    parentId = parent.parent_id;
  }
  return path;
}

export function findReconciledCreatedBookmark(
  item: PreparedBrowserBookmarkImportItem,
  beforeIds: string[],
  library: { bookmarks: Bookmark[]; folders: Folder[] },
): Bookmark | "ambiguous" | null {
  const before = new Set(beforeIds);
  const candidates = library.bookmarks.filter(
    (bookmark) =>
      !before.has(bookmark.id) &&
      normalizeImportedBookmarkUrl(bookmark.url) === item.url &&
      bookmark.title === item.title &&
      folderPathKey(bookmarkFolderPath(bookmark, library.folders)) ===
        folderPathKey(item.folderPath),
  );
  if (candidates.length === 0) return null;
  return candidates.length === 1 ? candidates[0] : "ambiguous";
}

export function bookmarkMatchesImportedOverwrite(
  bookmarkId: string,
  item: PreparedBrowserBookmarkImportItem,
  library: { bookmarks: Bookmark[]; folders: Folder[] },
): { content: boolean; folder: boolean } {
  const bookmark = library.bookmarks.find(({ id }) => id === bookmarkId);
  if (!bookmark) return { content: false, folder: false };
  return {
    content:
      bookmark.title === item.title &&
      normalizeImportedBookmarkUrl(bookmark.url) === item.url,
    folder:
      folderPathKey(bookmarkFolderPath(bookmark, library.folders)) ===
      folderPathKey(item.folderPath),
  };
}

export function getAuthoritativeFolderIdByPath(
  folders: ExistingImportFolder[],
): Map<string, string> {
  return getExistingFolderIdByPath(folders);
}
