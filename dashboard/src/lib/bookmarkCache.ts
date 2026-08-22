import type { Bookmark, Entry, Folder, Tag } from "../types/bookmark";
import type { TrashResourceType } from "./trashRepository";

const CACHE_DB_NAME = "bookmark-cache";
const CACHE_DB_VERSION = 4;
const BOOKMARKS_STORE = "bookmarks";
const ENTRIES_STORE = "entries";
const FOLDERS_STORE = "folders";
const TAGS_STORE = "tags";
const TRASH_STORE = "trash";
const META_STORE = "meta";
const USER_ID_INDEX = "user_id";

export type StoredBookmark = Bookmark & { __searchText: string };

export interface BookmarkCacheMeta {
  key: string;
  lastSyncedAt: string;
  revision?: string;
}

export interface CachedTrashItem {
  id: string;
  user_id: string;
  resourceId: string;
  resourceType: TrashResourceType;
  title: string;
  url: string | null;
  deletedAt: string;
  expiresAt: string;
}

export interface LibraryContentSnapshot {
  entries: Entry[];
  folders: Folder[];
  tags: Tag[];
  trash: CachedTrashItem[];
}

export interface LibraryContentDelta {
  upserts: LibraryContentSnapshot;
  deletes: {
    entries: string[];
    folders: string[];
    tags: string[];
    trash: string[];
  };
  revision: string;
  lastSyncedAt: string;
}

export interface BookmarkSearchPage {
  bookmarks: Bookmark[];
  total: number;
  offset: number;
  limit: number;
}

interface RankedBookmark {
  bookmark: StoredBookmark;
  score: number;
}

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      let bookmarksStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(BOOKMARKS_STORE)) {
        bookmarksStore = db.createObjectStore(BOOKMARKS_STORE, {
          keyPath: "id",
        });
      } else {
        bookmarksStore = req.transaction!.objectStore(BOOKMARKS_STORE);
      }
      if (!bookmarksStore.indexNames.contains(USER_ID_INDEX)) {
        bookmarksStore.createIndex(USER_ID_INDEX, "user_id", {
          unique: false,
        });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
      for (const storeName of [
        ENTRIES_STORE,
        FOLDERS_STORE,
        TAGS_STORE,
        TRASH_STORE,
      ]) {
        if (db.objectStoreNames.contains(storeName)) continue;
        const store = db.createObjectStore(storeName, { keyPath: "id" });
        store.createIndex(USER_ID_INDEX, "user_id", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function buildSearchText(bookmark: Bookmark): string {
  const folderNames = (bookmark.folders ?? []).map((f) => f.name).join(" ");
  const tagNames = (bookmark.tags ?? []).map((t) => t.name).join(" ");
  return [bookmark.title, bookmark.url, folderNames, tagNames]
    .join(" ")
    .toLowerCase();
}

export function scoreBookmarkMatch(
  bookmark: StoredBookmark,
  terms: string[],
): number {
  const title = bookmark.title.toLowerCase();
  const url = bookmark.url.toLowerCase();
  const folders = (bookmark.folders ?? [])
    .map((folder) => folder.name.toLowerCase())
    .join(" ");
  const tags = (bookmark.tags ?? [])
    .map((tag) => tag.name.toLowerCase())
    .join(" ");

  let score = 0;
  for (const term of terms) {
    if (title === term) score += 80;
    if (title.startsWith(term)) score += 45;
    if (title.includes(term)) score += 30;
    if (url.includes(term)) score += 18;
    if (tags.includes(term)) score += 12;
    if (folders.includes(term)) score += 8;
  }

  return score;
}

function asStoredBookmark(bookmark: Bookmark): StoredBookmark {
  return {
    ...bookmark,
    __searchText: buildSearchText(bookmark),
  };
}

function fromStoredBookmark(stored: StoredBookmark): Bookmark {
  const bookmark: Partial<StoredBookmark> = { ...stored };
  delete bookmark.__searchText;
  return bookmark as Bookmark;
}

export async function clearBookmarkCacheForUser(userId: string): Promise<void> {
  const db = await openCacheDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([BOOKMARKS_STORE, META_STORE], "readwrite");
    const store = tx.objectStore(BOOKMARKS_STORE);
    tx.objectStore(META_STORE).delete(`sync:${userId}`);
    const cursorReq = store.index(USER_ID_INDEX).openCursor(userId);

    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearLibraryContentCacheForUser(
  userId: string,
): Promise<void> {
  const db = await openCacheDb();
  const storeNames = [ENTRIES_STORE, FOLDERS_STORE, TAGS_STORE, TRASH_STORE];
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([...storeNames, META_STORE], "readwrite");
    tx.objectStore(META_STORE).delete(`content-sync:${userId}`);
    for (const storeName of storeNames) {
      deleteUserBookmarks(tx.objectStore(storeName), userId, () => {});
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function upsertCachedBookmarks(bookmarks: Bookmark[]): Promise<void> {
  if (bookmarks.length === 0) return;
  const db = await openCacheDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BOOKMARKS_STORE, "readwrite");
    const store = tx.objectStore(BOOKMARKS_STORE);
    for (const bookmark of bookmarks) {
      store.put(asStoredBookmark(bookmark));
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function assertBookmarksBelongToUser(
  userId: string,
  bookmarks: Bookmark[],
): void {
  if (bookmarks.some((bookmark) => bookmark.user_id !== userId)) {
    throw new Error("Cannot store another user's bookmark in this cache.");
  }
}

function isNewerCacheRevision(
  current: BookmarkCacheMeta | undefined,
  incomingRevision: string,
): boolean {
  if (!current?.revision || !/^\d+$/.test(current.revision)) return false;
  return BigInt(current.revision) > BigInt(incomingRevision);
}

function deleteUserBookmarks(
  store: IDBObjectStore,
  userId: string,
  onDeleted: () => void,
): void {
  const cursorReq = store.index(USER_ID_INDEX).openCursor(userId);
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (!cursor) {
      onDeleted();
      return;
    }
    cursor.delete();
    cursor.continue();
  };
}

function assertLibraryContentBelongsToUser(
  userId: string,
  snapshot: LibraryContentSnapshot,
): void {
  const allRows: Array<{ user_id: string }> = [
    ...snapshot.entries,
    ...snapshot.folders,
    ...snapshot.tags,
    ...snapshot.trash,
  ];
  if (allRows.some((row) => row.user_id !== userId)) {
    throw new Error("Cannot store another user's library data in this cache.");
  }
}

const CONTENT_STORES = {
  entries: ENTRIES_STORE,
  folders: FOLDERS_STORE,
  tags: TAGS_STORE,
  trash: TRASH_STORE,
} as const;

export async function replaceCachedLibraryContentForUser(
  userId: string,
  snapshot: LibraryContentSnapshot,
  meta: { revision: string; lastSyncedAt: string },
): Promise<void> {
  assertLibraryContentBelongsToUser(userId, snapshot);
  const db = await openCacheDb();
  const storeNames = [...Object.values(CONTENT_STORES), META_STORE];
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeNames, "readwrite");
    const metaStore = tx.objectStore(META_STORE);
    const currentMetaReq = metaStore.get(`content-sync:${userId}`);
    currentMetaReq.onsuccess = () => {
      if (
        isNewerCacheRevision(
          currentMetaReq.result as BookmarkCacheMeta | undefined,
          meta.revision,
        )
      ) {
        return;
      }
      for (const [key, storeName] of Object.entries(CONTENT_STORES) as Array<
        [keyof LibraryContentSnapshot, string]
      >) {
        const store = tx.objectStore(storeName);
        deleteUserBookmarks(store, userId, () => {
          for (const row of snapshot[key]) store.put(row);
        });
      }
      metaStore.put({
        key: `content-sync:${userId}`,
        revision: meta.revision,
        lastSyncedAt: meta.lastSyncedAt,
      } satisfies BookmarkCacheMeta);
    };
    currentMetaReq.onerror = () => tx.abort();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function applyLibraryContentCacheDelta(
  userId: string,
  delta: LibraryContentDelta,
): Promise<void> {
  assertLibraryContentBelongsToUser(userId, delta.upserts);
  const db = await openCacheDb();
  const storeNames = [...Object.values(CONTENT_STORES), META_STORE];
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeNames, "readwrite");
    const metaStore = tx.objectStore(META_STORE);
    const currentMetaReq = metaStore.get(`content-sync:${userId}`);
    currentMetaReq.onsuccess = () => {
      if (
        isNewerCacheRevision(
          currentMetaReq.result as BookmarkCacheMeta | undefined,
          delta.revision,
        )
      ) {
        return;
      }
      for (const [key, storeName] of Object.entries(CONTENT_STORES) as Array<
        [keyof LibraryContentSnapshot, string]
      >) {
        const store = tx.objectStore(storeName);
        for (const id of new Set(delta.deletes[key])) store.delete(id);
        for (const row of delta.upserts[key]) store.put(row);
      }
      metaStore.put({
        key: `content-sync:${userId}`,
        revision: delta.revision,
        lastSyncedAt: delta.lastSyncedAt,
      } satisfies BookmarkCacheMeta);
    };
    currentMetaReq.onerror = () => tx.abort();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function replaceCachedBookmarksForUser(
  userId: string,
  bookmarks: Bookmark[],
  meta: { revision: string; lastSyncedAt: string },
): Promise<void> {
  assertBookmarksBelongToUser(userId, bookmarks);
  const db = await openCacheDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([BOOKMARKS_STORE, META_STORE], "readwrite");
    const store = tx.objectStore(BOOKMARKS_STORE);
    const metaStore = tx.objectStore(META_STORE);
    const currentMetaReq = metaStore.get(`sync:${userId}`);
    currentMetaReq.onsuccess = () => {
      if (
        isNewerCacheRevision(
          currentMetaReq.result as BookmarkCacheMeta | undefined,
          meta.revision,
        )
      ) {
        return;
      }
      deleteUserBookmarks(store, userId, () => {
        for (const bookmark of bookmarks) {
          store.put(asStoredBookmark(bookmark));
        }
      });
      metaStore.put({
        key: `sync:${userId}`,
        revision: meta.revision,
        lastSyncedAt: meta.lastSyncedAt,
      } satisfies BookmarkCacheMeta);
    };
    currentMetaReq.onerror = () => {
      tx.abort();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function applyBookmarkCacheDelta(
  userId: string,
  delta: {
    upserts: Bookmark[];
    deletes: string[];
    revision: string;
    lastSyncedAt: string;
  },
): Promise<void> {
  assertBookmarksBelongToUser(userId, delta.upserts);
  const db = await openCacheDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([BOOKMARKS_STORE, META_STORE], "readwrite");
    const store = tx.objectStore(BOOKMARKS_STORE);
    const metaStore = tx.objectStore(META_STORE);
    const currentMetaReq = metaStore.get(`sync:${userId}`);
    currentMetaReq.onsuccess = () => {
      if (
        isNewerCacheRevision(
          currentMetaReq.result as BookmarkCacheMeta | undefined,
          delta.revision,
        )
      ) {
        return;
      }
      for (const bookmarkId of new Set(delta.deletes.filter(Boolean))) {
        store.delete(bookmarkId);
      }
      for (const bookmark of delta.upserts) {
        store.put(asStoredBookmark(bookmark));
      }
      metaStore.put({
        key: `sync:${userId}`,
        revision: delta.revision,
        lastSyncedAt: delta.lastSyncedAt,
      } satisfies BookmarkCacheMeta);
    };
    currentMetaReq.onerror = () => {
      tx.abort();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function upsertCachedBookmark(bookmark: Bookmark): Promise<void> {
  await upsertCachedBookmarks([bookmark]);
}

export async function deleteCachedBookmark(bookmarkId: string): Promise<void> {
  const db = await openCacheDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BOOKMARKS_STORE, "readwrite");
    tx.objectStore(BOOKMARKS_STORE).delete(bookmarkId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function compareBookmarkRank(
  left: RankedBookmark,
  right: RankedBookmark,
): number {
  if (left.score !== right.score) return left.score - right.score;
  return (left.bookmark.created_at ?? "").localeCompare(
    right.bookmark.created_at ?? "",
  );
}

function pushRankedBookmark(
  heap: RankedBookmark[],
  candidate: RankedBookmark,
  capacity: number,
): void {
  if (capacity <= 0) return;

  if (heap.length < capacity) {
    heap.push(candidate);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareBookmarkRank(heap[parent], heap[index]) <= 0) break;
      [heap[parent], heap[index]] = [heap[index], heap[parent]];
      index = parent;
    }
    return;
  }

  if (compareBookmarkRank(candidate, heap[0]) <= 0) return;
  heap[0] = candidate;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let worst = index;
    if (
      left < heap.length &&
      compareBookmarkRank(heap[left], heap[worst]) < 0
    ) {
      worst = left;
    }
    if (
      right < heap.length &&
      compareBookmarkRank(heap[right], heap[worst]) < 0
    ) {
      worst = right;
    }
    if (worst === index) break;
    [heap[index], heap[worst]] = [heap[worst], heap[index]];
    index = worst;
  }
}

export function searchStoredBookmarks(
  storedBookmarks: StoredBookmark[],
  query: string,
  options: { offset?: number; limit?: number } = {},
): BookmarkSearchPage {
  const normalizedQuery = query.trim().toLowerCase();
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(1, Math.floor(options.limit ?? 100));
  if (!normalizedQuery) return { bookmarks: [], total: 0, offset, limit };

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const requestedCount = offset + limit;
  const ranked: RankedBookmark[] = [];
  let total = 0;

  for (const bookmark of storedBookmarks) {
    const searchText = bookmark.__searchText ?? buildSearchText(bookmark);
    if (!terms.every((term) => searchText.includes(term))) continue;
    total += 1;
    pushRankedBookmark(
      ranked,
      { bookmark, score: scoreBookmarkMatch(bookmark, terms) },
      requestedCount,
    );
  }

  ranked.sort((left, right) => compareBookmarkRank(right, left));

  return {
    bookmarks: ranked
      .slice(offset, offset + limit)
      .map(({ bookmark }) => fromStoredBookmark(bookmark)),
    total,
    offset,
    limit,
  };
}

export async function searchCachedBookmarks(
  userId: string,
  query: string,
  options: { offset?: number; limit?: number } = {},
): Promise<BookmarkSearchPage> {
  const db = await openCacheDb();
  const tx = db.transaction(BOOKMARKS_STORE, "readonly");
  const store = tx.objectStore(BOOKMARKS_STORE);
  const stored =
    ((await reqToPromise(
      store.index(USER_ID_INDEX).getAll(userId),
    )) as StoredBookmark[]) ?? [];

  return searchStoredBookmarks(stored, query, options);
}

export async function getCachedBookmarksForUser(
  userId: string,
): Promise<Bookmark[]> {
  const db = await openCacheDb();
  const tx = db.transaction(BOOKMARKS_STORE, "readonly");
  const store = tx.objectStore(BOOKMARKS_STORE);
  const stored =
    ((await reqToPromise(
      store.index(USER_ID_INDEX).getAll(userId),
    )) as StoredBookmark[]) ?? [];

  return stored.map(fromStoredBookmark);
}

async function getCachedRowsForUser<T>(
  userId: string,
  storeName: string,
): Promise<T[]> {
  const db = await openCacheDb();
  const tx = db.transaction(storeName, "readonly");
  const rows = await reqToPromise(
    tx.objectStore(storeName).index(USER_ID_INDEX).getAll(userId),
  );
  return (rows as T[] | undefined) ?? [];
}

export function getCachedEntriesForUser(userId: string): Promise<Entry[]> {
  return getCachedRowsForUser<Entry>(userId, ENTRIES_STORE);
}

export function getCachedFoldersForUser(userId: string): Promise<Folder[]> {
  return getCachedRowsForUser<Folder>(userId, FOLDERS_STORE);
}

export function getCachedTagsForUser(userId: string): Promise<Tag[]> {
  return getCachedRowsForUser<Tag>(userId, TAGS_STORE);
}

export function getCachedTrashForUser(
  userId: string,
): Promise<CachedTrashItem[]> {
  return getCachedRowsForUser<CachedTrashItem>(userId, TRASH_STORE);
}

export async function getBookmarkCacheMeta(
  userId: string,
): Promise<BookmarkCacheMeta | null> {
  const db = await openCacheDb();
  const tx = db.transaction(META_STORE, "readonly");
  const entry = await reqToPromise(
    tx.objectStore(META_STORE).get(`sync:${userId}`),
  );
  return (entry as BookmarkCacheMeta | undefined) ?? null;
}

export async function getLibraryContentCacheMeta(
  userId: string,
): Promise<BookmarkCacheMeta | null> {
  const db = await openCacheDb();
  const tx = db.transaction(META_STORE, "readonly");
  const entry = await reqToPromise(
    tx.objectStore(META_STORE).get(`content-sync:${userId}`),
  );
  return (entry as BookmarkCacheMeta | undefined) ?? null;
}

export async function getBookmarkCacheSyncedAt(
  userId: string,
): Promise<string | null> {
  return (await getBookmarkCacheMeta(userId))?.lastSyncedAt ?? null;
}
