export const LOCAL_PROJECTION_KEY = "favlockLocalLibraryProjection";
export const LOCAL_PROJECTION_MESSAGE = "favlock.extension.local-projection";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CIPHERTEXT_LENGTH = 262_144;
const MAX_FOLDERS = 1_000;
const MAX_TAGS = 2_500;
const MAX_LISTS = 100;
const MAX_BOOKMARKS = 1_000;

function encrypted(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_CIPHERTEXT_LENGTH;
}

function uniqueIds(value, maximum) {
  return Array.isArray(value) &&
    value.length <= maximum &&
    value.every((id) => UUID.test(id)) &&
    new Set(value).size === value.length;
}

function hasUniqueRowIds(rows) {
  return new Set(rows.map((row) => row.id)).size === rows.length;
}

export function normalizeLocalProjection(value, expectedUserId) {
  if (
    value?.version !== 1 ||
    !UUID.test(value.userId || "") ||
    (expectedUserId && value.userId !== expectedUserId) ||
    typeof value.revision !== "string" ||
    value.revision.length < 1 ||
    value.revision.length > 128 ||
    typeof value.generatedAt !== "string" ||
    Number.isNaN(Date.parse(value.generatedAt)) ||
    !Array.isArray(value.folders) || value.folders.length > MAX_FOLDERS ||
    !Array.isArray(value.tags) || value.tags.length > MAX_TAGS ||
    !Array.isArray(value.lists) || value.lists.length > MAX_LISTS ||
    !Array.isArray(value.bookmarks) || value.bookmarks.length > MAX_BOOKMARKS
  ) return null;

  const folders = value.folders.map((folder) => {
    if (
      !UUID.test(folder?.id || "") ||
      !encrypted(folder.encryptedName) ||
      (folder.color !== null && (typeof folder.color !== "string" || folder.color.length > 64)) ||
      (folder.parentId !== null && !UUID.test(folder.parentId || "")) ||
      !Number.isSafeInteger(folder.sortOrder)
    ) return null;
    return {
      id: folder.id,
      encryptedName: folder.encryptedName,
      color: folder.color,
      parentId: folder.parentId,
      sortOrder: folder.sortOrder,
    };
  });
  const tags = value.tags.map((tag) => {
    if (!UUID.test(tag?.id || "") || !encrypted(tag.encryptedName)) return null;
    return { id: tag.id, encryptedName: tag.encryptedName };
  });
  const lists = value.lists.map((list) => {
    if (!UUID.test(list?.id || "") || !encrypted(list.encryptedName)) return null;
    return { id: list.id, encryptedName: list.encryptedName };
  });
  if (
    folders.includes(null) || tags.includes(null) || lists.includes(null) ||
    !hasUniqueRowIds(folders) || !hasUniqueRowIds(tags) || !hasUniqueRowIds(lists)
  ) return null;

  const folderIds = new Set(folders.map((folder) => folder.id));
  const tagIds = new Set(tags.map((tag) => tag.id));
  const listIds = new Set(lists.map((list) => list.id));
  if (folders.some((folder) => folder.parentId && !folderIds.has(folder.parentId))) return null;

  const bookmarks = value.bookmarks.map((bookmark) => {
    if (
      !UUID.test(bookmark?.id || "") ||
      !encrypted(bookmark.encryptedTitle) ||
      !encrypted(bookmark.encryptedUrl) ||
      (bookmark.folderId !== null && !folderIds.has(bookmark.folderId)) ||
      !uniqueIds(bookmark.tagIds, 100) ||
      !bookmark.tagIds.every((id) => tagIds.has(id)) ||
      !uniqueIds(bookmark.listIds, MAX_LISTS) ||
      !bookmark.listIds.every((id) => listIds.has(id))
    ) return null;
    return {
      id: bookmark.id,
      encryptedTitle: bookmark.encryptedTitle,
      encryptedUrl: bookmark.encryptedUrl,
      folderId: bookmark.folderId,
      tagIds: [...bookmark.tagIds],
      listIds: [...bookmark.listIds],
    };
  });
  if (bookmarks.includes(null) || !hasUniqueRowIds(bookmarks)) return null;

  return {
    version: 1,
    userId: value.userId,
    revision: value.revision,
    generatedAt: value.generatedAt,
    folders,
    tags,
    lists,
    bookmarks,
  };
}

export async function readLocalProjection(expectedUserId) {
  const stored = await chrome.storage.local.get(LOCAL_PROJECTION_KEY);
  return normalizeLocalProjection(stored[LOCAL_PROJECTION_KEY], expectedUserId);
}

export async function writeLocalProjection(value, expectedUserId) {
  const projection = normalizeLocalProjection(value, expectedUserId);
  if (!projection) throw new Error("FavLock received an invalid encrypted local library projection.");
  await chrome.storage.local.set({ [LOCAL_PROJECTION_KEY]: projection });
  return projection;
}

export function removeLocalProjection() {
  return chrome.storage.local.remove(LOCAL_PROJECTION_KEY);
}
