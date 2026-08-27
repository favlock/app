import type { Bookmark } from "../types/bookmark";
import { captureLocalVaultWork, trackLocalVaultWork } from "./localVaultWork";
import {
  fetchEncryptedLibraryBookmarks,
  type EncryptedLibraryBookmark,
} from "./libraryContentApi";
import {
  fetchBookmarkSyncChanges,
  fetchBookmarkSyncStatus,
  type BookmarkSyncStatus,
} from "./bookmarkSyncApi";
import {
  applyBookmarkCacheDelta,
  getBookmarkCacheMeta,
  replaceCachedBookmarksForUser,
} from "./bookmarkCache";

const MAX_CATCH_UP_PASSES = 5;

type DecryptFn = (value: string) => Promise<string>;

export interface BookmarkSyncResult {
  revision: string;
  lastSyncedAt: string;
  changed: boolean;
  rebuilt: boolean;
}

interface ActiveBookmarkSync {
  requested: boolean;
  promise: Promise<BookmarkSyncResult>;
}

const activeBookmarkSyncs = new Map<string, ActiveBookmarkSync>();

function compareRevisions(left: string, right: string): number {
  const leftRevision = BigInt(left);
  const rightRevision = BigInt(right);
  return leftRevision < rightRevision ? -1 : leftRevision > rightRevision ? 1 : 0;
}

function isSyncResetRequired(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("bookmark sync reset required")
  );
}

async function decryptBookmark(
  bookmark: EncryptedLibraryBookmark,
  userId: string,
  decryptField: DecryptFn,
): Promise<Bookmark> {
  return {
    id: bookmark.id,
    user_id: userId,
    title: await decryptField(bookmark.encryptedTitle),
    url: await decryptField(bookmark.encryptedUrl),
    created_at: bookmark.createdAt,
    is_favorite: bookmark.isFavorite,
    favorited_at: bookmark.favoritedAt,
    folders: await Promise.all(
      bookmark.folders.map(async (folder) => ({
        id: folder.id,
        user_id: userId,
        name: await decryptField(folder.encryptedName),
        color: folder.color,
        parent_id: folder.parentId,
        sort_order: folder.sortOrder,
        created_at: folder.createdAt,
      })),
    ),
    tags: await Promise.all(
      bookmark.tags.map(async (tag) => ({
        id: tag.id,
        user_id: userId,
        name: await decryptField(tag.encryptedName),
        created_at: tag.createdAt,
      })),
    ),
  };
}

async function decryptBookmarkRows(
  rows: EncryptedLibraryBookmark[],
  userId: string,
  decryptField: DecryptFn,
): Promise<Bookmark[]> {
  return Promise.all(
    rows.map((bookmark) =>
      decryptBookmark(bookmark, userId, decryptField),
    ),
  );
}

async function fetchBookmarksByIds(
  accessToken: string,
  userId: string,
  bookmarkIds: string[],
  decryptField: DecryptFn,
): Promise<Bookmark[]> {
  const uniqueIds = [...new Set(bookmarkIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  return decryptBookmarkRows(
    await fetchEncryptedLibraryBookmarks(accessToken, uniqueIds),
    userId,
    decryptField,
  );
}

async function fetchAllBookmarks(
  accessToken: string,
  userId: string,
  decryptField: DecryptFn,
): Promise<Bookmark[]> {
  return decryptBookmarkRows(
    await fetchEncryptedLibraryBookmarks(accessToken),
    userId,
    decryptField,
  );
}

async function loadDelta(
  accessToken: string,
  userId: string,
  afterRevision: string,
  throughRevision: string,
  decryptField: DecryptFn,
): Promise<{ upserts: Bookmark[]; deletes: string[]; changeCount: number }> {
  const changes = await fetchBookmarkSyncChanges(
    accessToken,
    afterRevision,
    throughRevision,
  );
  const requestedUpserts = changes
    .filter((change) => change.operation === "upsert")
    .map((change) => change.bookmarkId);
  const explicitDeletes = changes
    .filter((change) => change.operation === "delete")
    .map((change) => change.bookmarkId);
  const upserts = await fetchBookmarksByIds(
    accessToken,
    userId,
    requestedUpserts,
    decryptField,
  );
  const foundIds = new Set(upserts.map((bookmark) => bookmark.id));
  const missingUpserts = requestedUpserts.filter((id) => !foundIds.has(id));

  return {
    upserts,
    deletes: [...new Set([...explicitDeletes, ...missingUpserts])],
    changeCount: changes.length,
  };
}

async function rebuildBookmarkCache(
  accessToken: string,
  userId: string,
  decryptField: DecryptFn,
  initialStatus: BookmarkSyncStatus,
  assertCurrent: () => void,
): Promise<BookmarkSyncResult> {
  const snapshot = await fetchAllBookmarks(
    accessToken,
    userId,
    decryptField,
  );
  const bookmarksById = new Map(
    snapshot.map((bookmark) => [bookmark.id, bookmark]),
  );
  let revision = initialStatus.revision;

  for (let pass = 0; pass < MAX_CATCH_UP_PASSES; pass += 1) {
    assertCurrent();
    const status = await fetchBookmarkSyncStatus(accessToken);
    if (compareRevisions(revision, status.deltaFloor) < 0) {
      throw new Error("Bookmark sync history expired during index rebuild.");
    }
    if (compareRevisions(revision, status.revision) === 0) break;

    let delta: Awaited<ReturnType<typeof loadDelta>>;
    try {
      delta = await loadDelta(
        accessToken,
        userId,
        revision,
        status.revision,
        decryptField,
      );
    } catch (error) {
      if (isSyncResetRequired(error)) {
        return rebuildBookmarkCache(
          accessToken,
          userId,
          decryptField,
          await fetchBookmarkSyncStatus(accessToken),
          assertCurrent,
        );
      }
      throw error;
    }
    for (const bookmarkId of delta.deletes) bookmarksById.delete(bookmarkId);
    for (const bookmark of delta.upserts) {
      bookmarksById.set(bookmark.id, bookmark);
    }
    revision = status.revision;
  }

  const lastSyncedAt = new Date().toISOString();
  assertCurrent();
  await replaceCachedBookmarksForUser(userId, [...bookmarksById.values()], {
    revision,
    lastSyncedAt,
  });
  return { revision, lastSyncedAt, changed: true, rebuilt: true };
}

async function syncBookmarksOnce(
  accessToken: string,
  userId: string,
  decryptField: DecryptFn,
  assertCurrent: () => void,
): Promise<BookmarkSyncResult> {
  const localMeta = await getBookmarkCacheMeta(userId);
  const initialStatus = await fetchBookmarkSyncStatus(accessToken);
  const localRevision = localMeta?.revision;

  if (
    !localRevision ||
    compareRevisions(localRevision, initialStatus.deltaFloor) < 0 ||
    compareRevisions(localRevision, initialStatus.revision) > 0
  ) {
    return rebuildBookmarkCache(
      accessToken,
      userId,
      decryptField,
      initialStatus,
      assertCurrent,
    );
  }

  let revision = localRevision;
  let changed = false;
  let lastSyncedAt = localMeta.lastSyncedAt;

  for (let pass = 0; pass < MAX_CATCH_UP_PASSES; pass += 1) {
    const status =
      pass === 0
        ? initialStatus
        : await fetchBookmarkSyncStatus(accessToken);
    if (compareRevisions(revision, status.deltaFloor) < 0) {
      return rebuildBookmarkCache(accessToken, userId, decryptField, status, assertCurrent);
    }
    if (compareRevisions(revision, status.revision) === 0) break;

    let delta: Awaited<ReturnType<typeof loadDelta>>;
    try {
      delta = await loadDelta(
        accessToken,
        userId,
        revision,
        status.revision,
        decryptField,
      );
    } catch (error) {
      if (isSyncResetRequired(error)) {
        return rebuildBookmarkCache(
          accessToken,
          userId,
          decryptField,
          await fetchBookmarkSyncStatus(accessToken),
          assertCurrent,
        );
      }
      throw error;
    }
    lastSyncedAt = new Date().toISOString();
    assertCurrent();
    await applyBookmarkCacheDelta(userId, {
      upserts: delta.upserts,
      deletes: delta.deletes,
      revision: status.revision,
      lastSyncedAt,
    });
    revision = status.revision;
    changed ||= delta.changeCount > 0;
  }

  if (compareRevisions(revision, initialStatus.revision) === 0 && !changed) {
    assertCurrent();
    lastSyncedAt = new Date().toISOString();
    await applyBookmarkCacheDelta(userId, {
      upserts: [],
      deletes: [],
      revision,
      lastSyncedAt,
    });
  }

  return { revision, lastSyncedAt, changed, rebuilt: false };
}

export function syncBookmarksToLocalCache(
  userId: string,
  accessToken: string,
  decryptField: DecryptFn,
): Promise<BookmarkSyncResult> {
  const running = activeBookmarkSyncs.get(userId);
  if (running) {
    running.requested = true;
    return running.promise;
  }

  const active = { requested: false } as ActiveBookmarkSync;
  const assertCurrent = captureLocalVaultWork(userId);
  active.promise = (async () => {
    let result: BookmarkSyncResult;
    do {
      active.requested = false;
      assertCurrent();
      result = await syncBookmarksOnce(accessToken, userId, decryptField, assertCurrent);
    } while (active.requested);
    return result;
  })().finally(() => {
    activeBookmarkSyncs.delete(userId);
  });
  activeBookmarkSyncs.set(userId, active);
  return trackLocalVaultWork(userId, active.promise);
}
