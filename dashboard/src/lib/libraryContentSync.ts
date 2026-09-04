import type { Entry, Folder, Tag } from "../types/bookmark";
import { captureLocalVaultWork, trackLocalVaultWork } from "./localVaultWork";
import { sanitizeEntryHtml } from "./entryContent";
import {
  applyLibraryContentCacheDelta,
  getLibraryContentCacheMeta,
  replaceCachedLibraryContentForUser,
  type CachedTrashItem,
  type LibraryContentDelta,
  type LibraryContentSnapshot,
} from "./bookmarkCache";
import { fetchTrashItems, type TrashItem } from "./trashRepository";
import {
  fetchLibrarySyncChanges,
  fetchLibrarySyncStatus,
  type LibrarySyncChange as SyncChange,
} from "./librarySyncApi";
import {
  fetchEncryptedLibraryEntries,
  fetchEncryptedLibraryFolders,
  fetchEncryptedLibraryTags,
  type EncryptedLibraryEntry,
  type EncryptedLibraryFolder,
  type EncryptedLibraryTag,
} from "./libraryContentApi";

const MAX_CATCH_UP_PASSES = 5;

type DecryptField = (value: string) => Promise<string>;
type ResourceType = "entry" | "folder" | "tag" | "trash";
type Operation = "upsert" | "delete";

function compareRevision(left: string, right: string): number {
  const leftRevision = BigInt(left);
  const rightRevision = BigInt(right);
  return leftRevision < rightRevision ? -1 : leftRevision > rightRevision ? 1 : 0;
}

function isResetRequired(error: unknown): boolean {
  return error instanceof Error && error.message.includes("sync reset required");
}

async function decryptFolder(
  folder: EncryptedLibraryFolder,
  userId: string,
  decryptField: DecryptField,
): Promise<Folder> {
  return {
    id: folder.id,
    user_id: userId,
    name: await decryptField(folder.encryptedName),
    color: folder.color,
    parent_id: folder.parentId,
    sort_order: folder.sortOrder,
    created_at: folder.createdAt,
  };
}

async function decryptTag(
  tag: EncryptedLibraryTag,
  userId: string,
  decryptField: DecryptField,
): Promise<Tag> {
  return {
    id: tag.id,
    user_id: userId,
    name: await decryptField(tag.encryptedName),
    created_at: tag.createdAt,
  };
}

async function decryptEntry(
  row: EncryptedLibraryEntry,
  userId: string,
  decryptField: DecryptField,
): Promise<Entry> {
  const content = await decryptField(row.encryptedContent);
  return {
    id: row.id,
    user_id: userId,
    kind: row.kind,
    title: await decryptField(row.encryptedTitle),
    content: row.kind === "read" ? content : sanitizeEntryHtml(content),
    is_completed: row.isCompleted,
    completed_at: row.completedAt,
    due_date: row.dueDate,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    folder: row.folder
      ? await decryptFolder(row.folder, userId, decryptField)
      : null,
    tags: await Promise.all(
      row.tags.map((tag) => decryptTag(tag, userId, decryptField)),
    ),
  } as Entry;
}

async function decryptTrash(
  item: TrashItem,
  userId: string,
  decryptField: DecryptField,
): Promise<CachedTrashItem> {
  const decryptedTitle = await decryptField(item.encryptedTitle);
  let title = decryptedTitle;
  if (item.resourceType === "highlight") {
    try {
      const quote = JSON.parse(decryptedTitle) as { exact?: unknown };
      if (typeof quote.exact === "string" && quote.exact.trim()) {
        title = quote.exact;
      }
    } catch {
      // Keep the decrypted value as a safe fallback for legacy ciphertext.
    }
  }
  return {
    id: item.id,
    user_id: userId,
    resourceId: item.resourceId,
    resourceType: item.resourceType,
    title,
    url: item.encryptedUrl ? await decryptField(item.encryptedUrl) : null,
    deletedAt: item.deletedAt,
    expiresAt: item.expiresAt,
  };
}

async function fetchEntries(
  accessToken: string,
  userId: string,
  decryptField: DecryptField,
  ids?: string[],
): Promise<Entry[]> {
  if (ids && ids.length === 0) return [];
  const rows = await fetchEncryptedLibraryEntries(accessToken, ids);
  return Promise.all(
    rows.map((row) => decryptEntry(row, userId, decryptField)),
  );
}

async function fetchFolders(
  accessToken: string,
  userId: string,
  decryptField: DecryptField,
  ids?: string[],
): Promise<Folder[]> {
  if (ids && ids.length === 0) return [];
  const rows = await fetchEncryptedLibraryFolders(accessToken, ids);
  return Promise.all(
    rows.map((row) => decryptFolder(row, userId, decryptField)),
  );
}

async function fetchTags(
  accessToken: string,
  userId: string,
  decryptField: DecryptField,
  ids?: string[],
): Promise<Tag[]> {
  if (ids && ids.length === 0) return [];
  const rows = await fetchEncryptedLibraryTags(accessToken, ids);
  return Promise.all(
    rows.map((row) => decryptTag(row, userId, decryptField)),
  );
}

async function fetchTrash(
  accessToken: string,
  userId: string,
  decryptField: DecryptField,
  ids?: string[],
): Promise<CachedTrashItem[]> {
  if (ids && ids.length === 0) return [];
  const items = await fetchTrashItems(accessToken, ids);
  return Promise.all(
    items.map((item) => decryptTrash(item, userId, decryptField)),
  );
}

async function fetchSnapshot(
  accessToken: string,
  userId: string,
  decryptField: DecryptField,
): Promise<LibraryContentSnapshot> {
  const [entries, folders, tags, trash] = await Promise.all([
    fetchEntries(accessToken, userId, decryptField),
    fetchFolders(accessToken, userId, decryptField),
    fetchTags(accessToken, userId, decryptField),
    fetchTrash(accessToken, userId, decryptField),
  ]);
  return { entries, folders, tags, trash };
}

function emptySnapshot(): LibraryContentSnapshot {
  return { entries: [], folders: [], tags: [], trash: [] };
}

async function buildDelta(
  accessToken: string,
  userId: string,
  changes: SyncChange[],
  revision: string,
  decryptField: DecryptField,
): Promise<LibraryContentDelta> {
  const ids: Record<ResourceType, string[]> = {
    entry: [], folder: [], tag: [], trash: [],
  };
  const requestedOperation = new Map<string, Operation>();
  for (const change of changes) {
    ids[change.resourceType].push(change.resourceId);
    requestedOperation.set(`${change.resourceType}:${change.resourceId}`, change.operation);
  }
  for (const type of Object.keys(ids) as ResourceType[]) {
    ids[type] = [...new Set(ids[type])];
  }
  const [entries, folders, tags, trash] = await Promise.all([
    fetchEntries(accessToken, userId, decryptField, ids.entry.filter((id) => requestedOperation.get(`entry:${id}`) === "upsert")),
    fetchFolders(accessToken, userId, decryptField, ids.folder.filter((id) => requestedOperation.get(`folder:${id}`) === "upsert")),
    fetchTags(accessToken, userId, decryptField, ids.tag.filter((id) => requestedOperation.get(`tag:${id}`) === "upsert")),
    fetchTrash(accessToken, userId, decryptField, ids.trash.filter((id) => requestedOperation.get(`trash:${id}`) === "upsert")),
  ]);
  const found = {
    entries: new Set(entries.map(({ id }) => id)),
    folders: new Set(folders.map(({ id }) => id)),
    tags: new Set(tags.map(({ id }) => id)),
    trash: new Set(trash.map(({ id }) => id)),
  };
  const deleted = (type: ResourceType, key: keyof typeof found) =>
    ids[type].filter(
      (id) => requestedOperation.get(`${type}:${id}`) === "delete" || !found[key].has(id),
    );
  return {
    upserts: { entries, folders, tags, trash },
    deletes: {
      entries: deleted("entry", "entries"),
      folders: deleted("folder", "folders"),
      tags: deleted("tag", "tags"),
      trash: deleted("trash", "trash"),
    },
    revision,
    lastSyncedAt: new Date().toISOString(),
  };
}

function applyDeltaToSnapshot(
  snapshot: LibraryContentSnapshot,
  delta: LibraryContentDelta,
): LibraryContentSnapshot {
  const apply = <T extends { id: string }>(rows: T[], upserts: T[], deletes: string[]) => {
    const map = new Map(rows.map((row) => [row.id, row]));
    for (const id of deletes) map.delete(id);
    for (const row of upserts) map.set(row.id, row);
    return [...map.values()];
  };
  return {
    entries: apply(snapshot.entries, delta.upserts.entries, delta.deletes.entries),
    folders: apply(snapshot.folders, delta.upserts.folders, delta.deletes.folders),
    tags: apply(snapshot.tags, delta.upserts.tags, delta.deletes.tags),
    trash: apply(snapshot.trash, delta.upserts.trash, delta.deletes.trash),
  };
}

async function rebuildContentCache(
  accessToken: string,
  userId: string,
  decryptField: DecryptField,
  assertCurrent: () => void,
): Promise<{ revision: string; lastSyncedAt: string }> {
  const starting = await fetchLibrarySyncStatus(accessToken);
  let snapshot = await fetchSnapshot(accessToken, userId, decryptField);
  let revision = starting.revision;
  for (let pass = 0; pass < MAX_CATCH_UP_PASSES; pass += 1) {
    assertCurrent();
    const latest = await fetchLibrarySyncStatus(accessToken);
    if (compareRevision(revision, latest.revision) === 0) break;
    const changes = await fetchLibrarySyncChanges(
      accessToken,
      revision,
      latest.revision,
    );
    snapshot = applyDeltaToSnapshot(
      snapshot,
      await buildDelta(accessToken, userId, changes, latest.revision, decryptField),
    );
    revision = latest.revision;
  }
  const lastSyncedAt = new Date().toISOString();
  assertCurrent();
  await replaceCachedLibraryContentForUser(userId, snapshot, {
    revision,
    lastSyncedAt,
  });
  return { revision, lastSyncedAt };
}

async function runSync(
  accessToken: string,
  userId: string,
  decryptField: DecryptField,
  assertCurrent: () => void,
): Promise<{ revision: string; lastSyncedAt: string }> {
  assertCurrent();
  const [localMeta, status] = await Promise.all([
    getLibraryContentCacheMeta(userId),
    fetchLibrarySyncStatus(accessToken),
  ]);
  if (!localMeta?.revision || compareRevision(localMeta.revision, status.deltaFloor) < 0) {
    return rebuildContentCache(accessToken, userId, decryptField, assertCurrent);
  }
  if (compareRevision(localMeta.revision, status.revision) === 0) {
    assertCurrent();
    const lastSyncedAt = new Date().toISOString();
    await applyLibraryContentCacheDelta(userId, {
      upserts: emptySnapshot(),
      deletes: { entries: [], folders: [], tags: [], trash: [] },
      revision: status.revision,
      lastSyncedAt,
    });
    return { revision: status.revision, lastSyncedAt };
  }
  try {
    const changes = await fetchLibrarySyncChanges(
      accessToken,
      localMeta.revision,
      status.revision,
    );
    const delta = await buildDelta(accessToken, userId, changes, status.revision, decryptField);
    assertCurrent();
    await applyLibraryContentCacheDelta(userId, delta);
    return { revision: status.revision, lastSyncedAt: delta.lastSyncedAt };
  } catch (error) {
    if (isResetRequired(error)) return rebuildContentCache(accessToken, userId, decryptField, assertCurrent);
    throw error;
  }
}

const syncQueues = new Map<string, Promise<unknown>>();

export function syncLibraryContentToLocalCache(
  userId: string,
  accessToken: string,
  decryptField: DecryptField,
): Promise<{ revision: string; lastSyncedAt: string }> {
  const previous = syncQueues.get(userId) ?? Promise.resolve();
  const assertCurrent = captureLocalVaultWork(userId);
  const next = previous
    .catch(() => undefined)
    .then(() => runSync(accessToken, userId, decryptField, assertCurrent));
  syncQueues.set(userId, next);
  const cleanup = () => {
    if (syncQueues.get(userId) === next) syncQueues.delete(userId);
  };
  void next.then(cleanup, cleanup);
  return trackLocalVaultWork(userId, next);
}
