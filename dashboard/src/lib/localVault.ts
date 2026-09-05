import type { ColorConstant } from "../constants/colors";
import { LOCAL_PLAN } from "@favlock/shared";
import type {
  Bookmark,
  BookmarkList,
  Entry,
  EntryKind,
  Folder,
  Tag,
} from "../types/bookmark";
import type { EntryWriteValues } from "./entryRepository";
import type { FavLockExport } from "./dataExport";
import { decryptFieldStrict, encryptField } from "./encryption";
import type { PasskeyEncryptionRecord } from "./passkeyEncryption";

const DB_NAME = "favlock-local-vault";
const DB_VERSION = 2;
const BOOKMARKS = "bookmarks";
const FOLDERS = "folders";
const TAGS = "tags";
const ENTRIES = "entries";
const LISTS = "lists";
const LIST_ITEMS = "list_items";
const META = "meta";
const VAULT_ID_INDEX = "vault_id";

export const LOCAL_BOOKMARK_LIMIT = LOCAL_PLAN.limits.bookmarks;
export const LOCAL_ENTRY_LIMIT = LOCAL_PLAN.limits.entries;
export const LOCAL_READSPACE_LIMIT = LOCAL_PLAN.limits.readspace;
export const LOCAL_LIST_LIMIT = LOCAL_PLAN.limits.lists;
export const LOCAL_VAULT_CHANGED_EVENT = "favlock:local-vault-changed";

interface LocalBookmarkRecord {
  id: string;
  vault_id: string;
  encrypted_title: string;
  encrypted_url: string;
  folder_id: string | null;
  tag_ids: string[];
  is_favorite: boolean;
  favorited_at: string | null;
  created_at: string;
}

interface LocalFolderRecord {
  id: string;
  vault_id: string;
  encrypted_name: string;
  color: ColorConstant | null;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
}

interface LocalTagRecord {
  id: string;
  vault_id: string;
  encrypted_name: string;
  created_at: string;
}

interface LocalEntryRecord {
  id: string;
  vault_id: string;
  kind: EntryKind;
  encrypted_title: string;
  encrypted_content: string;
  folder_id: string | null;
  tag_ids: string[];
  is_completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

interface LocalListRecord {
  id: string;
  vault_id: string;
  encrypted_name: string;
  created_at: string;
  updated_at: string;
}

interface LocalListItemRecord {
  id: string;
  vault_id: string;
  list_id: string;
  bookmark_id: string;
  position: number;
  completed_at: string | null;
  created_at: string;
}

type LocalMetaRecord =
  | { key: `revision:${string}`; value: string }
  | { key: `passkey:${string}`; value: PasskeyEncryptionRecord };

export interface CreateLocalBookmarkInput {
  encryptedTitle: string;
  encryptedUrl: string;
  folderId: string | null;
  existingTagIds: string[];
  newEncryptedTagNames: string[];
}

export interface CreateLocalExtensionBookmarkInput extends CreateLocalBookmarkInput {
  existingBookmarkId: string | null;
  selectedListIds: string[];
  encryptedNewCollectionName: string | null;
  encryptedNewListName: string | null;
}

export interface LocalBookmarkImportItem {
  title: string;
  url: string;
  folderPath: string[];
  overwriteBookmarkId?: string;
}

export interface LocalBookmarkImportResult {
  added: number;
  overwritten: number;
  collectionsCreated: number;
}

export interface LocalEncryptedPreviewItem {
  kind: "Bookmark" | "Collection" | "Tag" | "Document" | "Task" | "Readspace" | "List";
  protectedFields: Array<{ label: string; ciphertext: string }>;
  metadata: Array<{ label: string; value: string }>;
}

export interface LocalExtensionProjection {
  version: 1;
  userId: string;
  revision: string;
  generatedAt: string;
  folders: Array<{
    id: string;
    encryptedName: string;
    color: ColorConstant | null;
    parentId: string | null;
    sortOrder: number;
  }>;
  tags: Array<{ id: string; encryptedName: string }>;
  lists: Array<{ id: string; encryptedName: string }>;
  bookmarks: Array<{
    id: string;
    encryptedTitle: string;
    encryptedUrl: string;
    folderId: string | null;
    tagIds: string[];
    listIds: string[];
  }>;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openLocalVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of [
        BOOKMARKS,
        FOLDERS,
        TAGS,
        ENTRIES,
        LISTS,
        LIST_ITEMS,
      ]) {
        if (db.objectStoreNames.contains(storeName)) continue;
        const store = db.createObjectStore(storeName, { keyPath: "id" });
        store.createIndex(VAULT_ID_INDEX, "vault_id", { unique: false });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function recordsForVault<T>(
  storeName: string,
  vaultId: string,
): Promise<T[]> {
  const db = await openLocalVault();
  const transaction = db.transaction(storeName, "readonly");
  const result = await requestResult(
    transaction.objectStore(storeName).index(VAULT_ID_INDEX).getAll(vaultId),
  );
  await transactionDone(transaction);
  return result as T[];
}

function nextRevision(): string {
  return `${Date.now()}:${crypto.randomUUID()}`;
}

function notifyLocalVaultChanged(vaultId: string, revision: string): void {
  if (
    typeof globalThis.dispatchEvent === "function" &&
    typeof globalThis.CustomEvent === "function"
  ) {
    globalThis.dispatchEvent(
      new CustomEvent(LOCAL_VAULT_CHANGED_EVENT, {
        detail: { vaultId, revision },
      }),
    );
  }
}

function putRevision(transaction: IDBTransaction, vaultId: string): string {
  const revision = nextRevision();
  transaction.objectStore(META).put({
    key: `revision:${vaultId}`,
    value: revision,
  } satisfies LocalMetaRecord);
  transaction.addEventListener("complete", () => {
    notifyLocalVaultChanged(vaultId, revision);
  }, { once: true });
  return revision;
}

export async function getLocalVaultRevision(vaultId: string): Promise<string> {
  const db = await openLocalVault();
  const transaction = db.transaction(META, "readonly");
  const record = (await requestResult(
    transaction.objectStore(META).get(`revision:${vaultId}`),
  )) as LocalMetaRecord | undefined;
  await transactionDone(transaction);
  return record && typeof record.value === "string" ? record.value : "empty";
}

export async function readLocalExtensionProjection(
  vaultId: string,
): Promise<LocalExtensionProjection> {
  const db = await openLocalVault();
  const transaction = db.transaction(
    [BOOKMARKS, FOLDERS, TAGS, LISTS, LIST_ITEMS, META],
    "readonly",
  );
  const [bookmarks, folders, tags, lists, listItems, revisionRecord] =
    await Promise.all([
      requestResult(
        transaction.objectStore(BOOKMARKS).index(VAULT_ID_INDEX).getAll(vaultId),
      ) as Promise<LocalBookmarkRecord[]>,
      requestResult(
        transaction.objectStore(FOLDERS).index(VAULT_ID_INDEX).getAll(vaultId),
      ) as Promise<LocalFolderRecord[]>,
      requestResult(
        transaction.objectStore(TAGS).index(VAULT_ID_INDEX).getAll(vaultId),
      ) as Promise<LocalTagRecord[]>,
      requestResult(
        transaction.objectStore(LISTS).index(VAULT_ID_INDEX).getAll(vaultId),
      ) as Promise<LocalListRecord[]>,
      requestResult(
        transaction.objectStore(LIST_ITEMS).index(VAULT_ID_INDEX).getAll(vaultId),
      ) as Promise<LocalListItemRecord[]>,
      requestResult(transaction.objectStore(META).get(`revision:${vaultId}`)) as
        Promise<LocalMetaRecord | undefined>,
    ]);
  await transactionDone(transaction);

  const folderIds = new Set(folders.map((folder) => folder.id));
  const tagIds = new Set(tags.map((tag) => tag.id));
  const listIds = new Set(lists.map((list) => list.id));
  const bookmarkIds = new Set(bookmarks.map((bookmark) => bookmark.id));
  const listIdsByBookmark = new Map<string, string[]>();
  for (const item of listItems) {
    if (!bookmarkIds.has(item.bookmark_id) || !listIds.has(item.list_id)) continue;
    const bookmarkListIds = listIdsByBookmark.get(item.bookmark_id) ?? [];
    if (!bookmarkListIds.includes(item.list_id)) bookmarkListIds.push(item.list_id);
    listIdsByBookmark.set(item.bookmark_id, bookmarkListIds);
  }

  return {
    version: 1,
    userId: vaultId,
    revision:
      revisionRecord && typeof revisionRecord.value === "string"
        ? revisionRecord.value
        : "empty",
    generatedAt: new Date().toISOString(),
    folders: folders.map((folder) => ({
      id: folder.id,
      encryptedName: folder.encrypted_name,
      color: folder.color,
      parentId: folder.parent_id && folderIds.has(folder.parent_id)
        ? folder.parent_id
        : null,
      sortOrder: folder.sort_order,
    })),
    tags: tags.map((tag) => ({
      id: tag.id,
      encryptedName: tag.encrypted_name,
    })),
    lists: lists.map((list) => ({
      id: list.id,
      encryptedName: list.encrypted_name,
    })),
    bookmarks: bookmarks.map((bookmark) => ({
      id: bookmark.id,
      encryptedTitle: bookmark.encrypted_title,
      encryptedUrl: bookmark.encrypted_url,
      folderId: bookmark.folder_id && folderIds.has(bookmark.folder_id)
        ? bookmark.folder_id
        : null,
      tagIds: [...new Set(bookmark.tag_ids)].filter((tagId) => tagIds.has(tagId)),
      listIds: listIdsByBookmark.get(bookmark.id) ?? [],
    })),
  };
}

export async function hasLocalVaultContent(vaultId: string): Promise<boolean> {
  const db = await openLocalVault();
  const contentStores = [BOOKMARKS, FOLDERS, TAGS, ENTRIES, LISTS, LIST_ITEMS];
  const transaction = db.transaction(contentStores, "readonly");
  const counts = await Promise.all(
    contentStores.map((storeName) =>
      requestResult(
        transaction.objectStore(storeName).index(VAULT_ID_INDEX).count(vaultId),
      ),
    ),
  );
  await transactionDone(transaction);
  return counts.some((count) => count > 0);
}

export async function readLocalResourceUsage(vaultId: string) {
  const db = await openLocalVault();
  const transaction = db.transaction(
    [BOOKMARKS, FOLDERS, TAGS, ENTRIES, LISTS],
    "readonly",
  );
  const [bookmarks, collections, tags, entries, lists] = await Promise.all([
    requestResult(transaction.objectStore(BOOKMARKS).index(VAULT_ID_INDEX).count(vaultId)),
    requestResult(transaction.objectStore(FOLDERS).index(VAULT_ID_INDEX).count(vaultId)),
    requestResult(transaction.objectStore(TAGS).index(VAULT_ID_INDEX).count(vaultId)),
    requestResult<LocalEntryRecord[]>(
      transaction.objectStore(ENTRIES).index(VAULT_ID_INDEX).getAll(vaultId),
    ),
    requestResult(transaction.objectStore(LISTS).index(VAULT_ID_INDEX).count(vaultId)),
  ]);
  await transactionDone(transaction);
  return {
    bookmarks,
    entries: entries.filter((entry) => entry.kind !== "read").length,
    readspace: entries.filter((entry) => entry.kind === "read").length,
    collections,
    tags,
    lists,
  };
}

export async function readLocalFolders(
  vaultId: string,
  key: CryptoKey,
): Promise<Folder[]> {
  const rows = await recordsForVault<LocalFolderRecord>(FOLDERS, vaultId);
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      user_id: vaultId,
      name: await decryptFieldStrict(row.encrypted_name, key),
      color: row.color,
      parent_id: row.parent_id,
      sort_order: row.sort_order,
      created_at: row.created_at,
    })),
  );
}

export async function readLocalTags(
  vaultId: string,
  key: CryptoKey,
): Promise<Tag[]> {
  const rows = await recordsForVault<LocalTagRecord>(TAGS, vaultId);
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      user_id: vaultId,
      name: await decryptFieldStrict(row.encrypted_name, key),
      created_at: row.created_at,
    })),
  );
}

export async function readLocalBookmarks(
  vaultId: string,
  key: CryptoKey,
): Promise<Bookmark[]> {
  const [bookmarks, folders, tags] = await Promise.all([
    recordsForVault<LocalBookmarkRecord>(BOOKMARKS, vaultId),
    readLocalFolders(vaultId, key),
    readLocalTags(vaultId, key),
  ]);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  return Promise.all(
    bookmarks.map(async (row) => ({
      id: row.id,
      user_id: vaultId,
      title: await decryptFieldStrict(row.encrypted_title, key),
      url: await decryptFieldStrict(row.encrypted_url, key),
      created_at: row.created_at,
      is_favorite: row.is_favorite,
      favorited_at: row.favorited_at,
      folders: row.folder_id && folderById.has(row.folder_id)
        ? [folderById.get(row.folder_id)!]
        : [],
      tags: row.tag_ids.flatMap((tagId) => {
        const tag = tagById.get(tagId);
        return tag ? [tag] : [];
      }),
    })),
  );
}

export async function readLocalEntries(
  vaultId: string,
  key: CryptoKey,
): Promise<Entry[]> {
  const [entries, folders, tags] = await Promise.all([
    recordsForVault<LocalEntryRecord>(ENTRIES, vaultId),
    readLocalFolders(vaultId, key),
    readLocalTags(vaultId, key),
  ]);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  return Promise.all(entries.map(async (row): Promise<Entry> => {
    const base = {
      id: row.id,
      user_id: vaultId,
      kind: row.kind,
      title: await decryptFieldStrict(row.encrypted_title, key),
      content: await decryptFieldStrict(row.encrypted_content, key),
      created_at: row.created_at,
      updated_at: row.updated_at,
      folder: row.folder_id ? folderById.get(row.folder_id) ?? null : null,
      tags: row.tag_ids.flatMap((tagId) => {
        const tag = tagById.get(tagId);
        return tag ? [tag] : [];
      }),
    };
    return row.kind === "todo"
      ? {
          ...base,
          kind: "todo",
          is_completed: row.is_completed,
          completed_at: row.completed_at,
          due_date: row.due_date,
        }
      : row.kind === "read"
        ? { ...base, kind: "read" }
        : { ...base, kind: "note" };
  }));
}

export async function readLocalLists(
  vaultId: string,
  key: CryptoKey,
): Promise<BookmarkList[]> {
  const [lists, items, bookmarks] = await Promise.all([
    recordsForVault<LocalListRecord>(LISTS, vaultId),
    recordsForVault<LocalListItemRecord>(LIST_ITEMS, vaultId),
    readLocalBookmarks(vaultId, key),
  ]);
  const bookmarkById = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  return Promise.all(lists.map(async (list) => ({
    id: list.id,
    user_id: vaultId,
    name: await decryptFieldStrict(list.encrypted_name, key),
    created_at: list.created_at,
    updated_at: list.updated_at,
    items: items
      .filter((item) => item.list_id === list.id && bookmarkById.has(item.bookmark_id))
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
      .map((item) => ({
        bookmark: bookmarkById.get(item.bookmark_id)!,
        position: item.position,
        completed_at: item.completed_at,
        created_at: item.created_at,
      })),
  })));
}

async function addLocalEncryptedTags(
  transaction: IDBTransaction,
  vaultId: string,
  existingTagIds: string[],
  newEncryptedTagNames: string[],
): Promise<string[]> {
  const tagIds = [...new Set(existingTagIds)];
  const tagStore = transaction.objectStore(TAGS);
  for (const encryptedName of newEncryptedTagNames) {
    const id = crypto.randomUUID();
    tagStore.put({
      id,
      vault_id: vaultId,
      encrypted_name: encryptedName,
      created_at: new Date().toISOString(),
    } satisfies LocalTagRecord);
    tagIds.push(id);
  }
  return tagIds;
}

export async function createLocalEntry(
  vaultId: string,
  kind: EntryKind,
  values: EntryWriteValues,
): Promise<string> {
  const db = await openLocalVault();
  const transaction = db.transaction([ENTRIES, TAGS, META], "readwrite");
  const store = transaction.objectStore(ENTRIES);
  const existing = (await requestResult(
    store.index(VAULT_ID_INDEX).getAll(vaultId),
  )) as LocalEntryRecord[];
  const limit = kind === "read" ? LOCAL_READSPACE_LIMIT : LOCAL_ENTRY_LIMIT;
  const count = existing.filter((entry) =>
    kind === "read" ? entry.kind === "read" : entry.kind !== "read"
  ).length;
  if (limit > 0 && count >= limit) {
    transaction.abort();
    throw new Error(
      kind === "read"
        ? `Local Readspace limit reached. Create a free account to save more than ${limit} articles.`
        : `Local entry limit reached. Create a free account to save more than ${limit} documents and tasks.`,
    );
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  store.add({
    id,
    vault_id: vaultId,
    kind,
    encrypted_title: values.title,
    encrypted_content: values.content,
    folder_id: values.folderId,
    tag_ids: await addLocalEncryptedTags(
      transaction,
      vaultId,
      values.existingTagIds,
      values.newEncryptedTagNames,
    ),
    is_completed: false,
    completed_at: null,
    due_date: kind === "todo" ? values.dueDate ?? null : null,
    created_at: now,
    updated_at: now,
  } satisfies LocalEntryRecord);
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
  return id;
}

export async function updateLocalEntry(
  vaultId: string,
  entryId: string,
  values: EntryWriteValues,
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([ENTRIES, TAGS, META], "readwrite");
  const store = transaction.objectStore(ENTRIES);
  const current = (await requestResult(store.get(entryId))) as LocalEntryRecord | undefined;
  if (!current || current.vault_id !== vaultId) {
    transaction.abort();
    throw new Error("The local entry could not be found.");
  }
  store.put({
    ...current,
    encrypted_title: values.title,
    encrypted_content: values.content,
    folder_id: values.folderId,
    tag_ids: await addLocalEncryptedTags(
      transaction,
      vaultId,
      values.existingTagIds,
      values.newEncryptedTagNames,
    ),
    due_date: current.kind === "todo" ? values.dueDate ?? null : null,
    updated_at: new Date().toISOString(),
  } satisfies LocalEntryRecord);
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

async function mutateLocalEntry(
  vaultId: string,
  entryId: string,
  mutate: (record: LocalEntryRecord) => LocalEntryRecord | null,
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([ENTRIES, META], "readwrite");
  const store = transaction.objectStore(ENTRIES);
  const current = (await requestResult(store.get(entryId))) as LocalEntryRecord | undefined;
  if (!current || current.vault_id !== vaultId) {
    transaction.abort();
    throw new Error("The local entry could not be found.");
  }
  const next = mutate(current);
  if (next) store.put({ ...next, updated_at: new Date().toISOString() });
  else store.delete(entryId);
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

export function deleteLocalEntry(vaultId: string, entryId: string): Promise<void> {
  return mutateLocalEntry(vaultId, entryId, () => null);
}

export function setLocalTodoCompleted(
  vaultId: string,
  todoId: string,
  isCompleted: boolean,
): Promise<void> {
  return mutateLocalEntry(vaultId, todoId, (record) => {
    if (record.kind !== "todo") throw new Error("The local Task could not be found.");
    return {
      ...record,
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
    };
  });
}

export function moveLocalEntry(
  vaultId: string,
  entryId: string,
  folderId: string | null,
): Promise<void> {
  return mutateLocalEntry(vaultId, entryId, (record) => ({ ...record, folder_id: folderId }));
}

export async function updateLocalReadspaceOrganization(
  vaultId: string,
  values: {
    entryId: string;
    folderId: string | null;
    existingTagIds: string[];
    newEncryptedTagNames: string[];
  },
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([ENTRIES, TAGS, META], "readwrite");
  const store = transaction.objectStore(ENTRIES);
  const current = (await requestResult(store.get(values.entryId))) as LocalEntryRecord | undefined;
  if (!current || current.vault_id !== vaultId || current.kind !== "read") {
    transaction.abort();
    throw new Error("The local Readspace article could not be found.");
  }
  store.put({
    ...current,
    folder_id: values.folderId,
    tag_ids: await addLocalEncryptedTags(
      transaction,
      vaultId,
      values.existingTagIds,
      values.newEncryptedTagNames,
    ),
    updated_at: new Date().toISOString(),
  } satisfies LocalEntryRecord);
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

export async function createLocalList(
  vaultId: string,
  encryptedName: string,
): Promise<string> {
  const db = await openLocalVault();
  const transaction = db.transaction([LISTS, META], "readwrite");
  const store = transaction.objectStore(LISTS);
  const count = await requestResult(store.index(VAULT_ID_INDEX).count(vaultId));
  if (LOCAL_LIST_LIMIT > 0 && count >= LOCAL_LIST_LIMIT) {
    transaction.abort();
    throw new Error(
      `Local List limit reached. Create a free account to use more than ${LOCAL_LIST_LIMIT} Lists.`,
    );
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  store.add({
    id,
    vault_id: vaultId,
    encrypted_name: encryptedName,
    created_at: now,
    updated_at: now,
  } satisfies LocalListRecord);
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
  return id;
}

export async function renameLocalList(
  vaultId: string,
  listId: string,
  encryptedName: string,
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([LISTS, META], "readwrite");
  const store = transaction.objectStore(LISTS);
  const current = (await requestResult(store.get(listId))) as LocalListRecord | undefined;
  if (!current || current.vault_id !== vaultId) {
    transaction.abort();
    throw new Error("The local List could not be found.");
  }
  store.put({ ...current, encrypted_name: encryptedName, updated_at: new Date().toISOString() });
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

export async function deleteLocalList(vaultId: string, listId: string): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([LISTS, LIST_ITEMS, META], "readwrite");
  const listStore = transaction.objectStore(LISTS);
  const current = (await requestResult(listStore.get(listId))) as LocalListRecord | undefined;
  if (!current || current.vault_id !== vaultId) {
    transaction.abort();
    throw new Error("The local List could not be found.");
  }
  listStore.delete(listId);
  const itemStore = transaction.objectStore(LIST_ITEMS);
  const items = (await requestResult(
    itemStore.index(VAULT_ID_INDEX).getAll(vaultId),
  )) as LocalListItemRecord[];
  for (const item of items) if (item.list_id === listId) itemStore.delete(item.id);
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

function localListItemId(listId: string, bookmarkId: string): string {
  return `${listId}:${bookmarkId}`;
}

export async function addLocalListItem(
  vaultId: string,
  listId: string,
  bookmarkId: string,
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([LISTS, LIST_ITEMS, BOOKMARKS, META], "readwrite");
  const [list, bookmark] = await Promise.all([
    requestResult(transaction.objectStore(LISTS).get(listId)) as Promise<LocalListRecord | undefined>,
    requestResult(transaction.objectStore(BOOKMARKS).get(bookmarkId)) as Promise<LocalBookmarkRecord | undefined>,
  ]);
  if (!list || list.vault_id !== vaultId || !bookmark || bookmark.vault_id !== vaultId) {
    transaction.abort();
    throw new Error("The local List or bookmark could not be found.");
  }
  const store = transaction.objectStore(LIST_ITEMS);
  const id = localListItemId(listId, bookmarkId);
  const current = (await requestResult(store.get(id))) as LocalListItemRecord | undefined;
  if (!current) {
    const items = (await requestResult(store.index(VAULT_ID_INDEX).getAll(vaultId))) as LocalListItemRecord[];
    const position = items.filter((item) => item.list_id === listId).length;
    store.add({
      id,
      vault_id: vaultId,
      list_id: listId,
      bookmark_id: bookmarkId,
      position,
      completed_at: null,
      created_at: new Date().toISOString(),
    } satisfies LocalListItemRecord);
    putRevision(transaction, vaultId);
  }
  await transactionDone(transaction);
}

export async function removeLocalListItem(
  vaultId: string,
  listId: string,
  bookmarkId: string,
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([LIST_ITEMS, META], "readwrite");
  const store = transaction.objectStore(LIST_ITEMS);
  const id = localListItemId(listId, bookmarkId);
  const current = (await requestResult(store.get(id))) as LocalListItemRecord | undefined;
  if (!current || current.vault_id !== vaultId) {
    transaction.abort();
    throw new Error("The local List item could not be found.");
  }
  store.delete(id);
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

export async function setLocalListItemCompleted(
  vaultId: string,
  listId: string,
  bookmarkId: string,
  completed: boolean,
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([LIST_ITEMS, META], "readwrite");
  const store = transaction.objectStore(LIST_ITEMS);
  const id = localListItemId(listId, bookmarkId);
  const current = (await requestResult(store.get(id))) as LocalListItemRecord | undefined;
  if (!current || current.vault_id !== vaultId) {
    transaction.abort();
    throw new Error("The local List item could not be found.");
  }
  store.put({ ...current, completed_at: completed ? new Date().toISOString() : null });
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

export async function setLocalBookmarkLists(
  vaultId: string,
  bookmarkId: string,
  listIds: string[],
): Promise<void> {
  const [lists, db] = await Promise.all([
    recordsForVault<LocalListRecord>(LISTS, vaultId),
    openLocalVault(),
  ]);
  const validIds = new Set(lists.map((list) => list.id));
  if (listIds.some((listId) => !validIds.has(listId))) {
    throw new Error("A local List could not be found.");
  }
  const transaction = db.transaction([BOOKMARKS, LIST_ITEMS, META], "readwrite");
  const bookmark = (await requestResult(
    transaction.objectStore(BOOKMARKS).get(bookmarkId),
  )) as LocalBookmarkRecord | undefined;
  if (!bookmark || bookmark.vault_id !== vaultId) {
    transaction.abort();
    throw new Error("The local bookmark could not be found.");
  }
  const selected = new Set(listIds);
  const store = transaction.objectStore(LIST_ITEMS);
  const items = (await requestResult(store.index(VAULT_ID_INDEX).getAll(vaultId))) as LocalListItemRecord[];
  const currentListIds = new Set(items.filter((item) => item.bookmark_id === bookmarkId).map((item) => item.list_id));
  for (const item of items) {
    if (item.bookmark_id === bookmarkId && !selected.has(item.list_id)) store.delete(item.id);
  }
  for (const listId of selected) {
    if (currentListIds.has(listId)) continue;
    const position = items.filter((item) => item.list_id === listId).length;
    store.add({
      id: localListItemId(listId, bookmarkId),
      vault_id: vaultId,
      list_id: listId,
      bookmark_id: bookmarkId,
      position,
      completed_at: null,
      created_at: new Date().toISOString(),
    } satisfies LocalListItemRecord);
  }
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

export async function reorderLocalListItems(
  vaultId: string,
  listId: string,
  bookmarkIds: string[],
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([LIST_ITEMS, META], "readwrite");
  const store = transaction.objectStore(LIST_ITEMS);
  const items = (await requestResult(store.index(VAULT_ID_INDEX).getAll(vaultId))) as LocalListItemRecord[];
  const listItems = items.filter((item) => item.list_id === listId);
  if (
    bookmarkIds.length !== listItems.length ||
    new Set(bookmarkIds).size !== bookmarkIds.length ||
    bookmarkIds.some((id) => !listItems.some((item) => item.bookmark_id === id))
  ) {
    transaction.abort();
    throw new Error("The local List changed before it could be reordered.");
  }
  bookmarkIds.forEach((bookmarkId, position) => {
    const item = listItems.find((candidate) => candidate.bookmark_id === bookmarkId)!;
    store.put({ ...item, position });
  });
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

export async function readLocalEncryptedPreview(
  vaultId: string,
): Promise<LocalEncryptedPreviewItem[]> {
  const [bookmarks, folders, tags, entries, lists] = await Promise.all([
    recordsForVault<LocalBookmarkRecord>(BOOKMARKS, vaultId),
    recordsForVault<LocalFolderRecord>(FOLDERS, vaultId),
    recordsForVault<LocalTagRecord>(TAGS, vaultId),
    recordsForVault<LocalEntryRecord>(ENTRIES, vaultId),
    recordsForVault<LocalListRecord>(LISTS, vaultId),
  ]);

  const recentBookmarks = [...bookmarks]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, 2)
    .map((bookmark): LocalEncryptedPreviewItem => ({
      kind: "Bookmark",
      protectedFields: [
        { label: "title", ciphertext: bookmark.encrypted_title },
        { label: "url", ciphertext: bookmark.encrypted_url },
      ],
      metadata: [
        { label: "created", value: bookmark.created_at },
        { label: "favorite", value: bookmark.is_favorite ? "yes" : "no" },
        { label: "tag count", value: String(bookmark.tag_ids.length) },
      ],
    }));
  const recentFolders = [...folders]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, 1)
    .map((folder): LocalEncryptedPreviewItem => ({
      kind: "Collection",
      protectedFields: [
        { label: "name", ciphertext: folder.encrypted_name },
      ],
      metadata: [
        { label: "created", value: folder.created_at },
        { label: "sort order", value: String(folder.sort_order) },
      ],
    }));
  const recentTags = [...tags]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, 1)
    .map((tag): LocalEncryptedPreviewItem => ({
      kind: "Tag",
      protectedFields: [
        { label: "name", ciphertext: tag.encrypted_name },
      ],
      metadata: [{ label: "created", value: tag.created_at }],
    }));

  const recentEntries = [...entries]
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    .slice(0, 2)
    .map((entry): LocalEncryptedPreviewItem => ({
      kind: entry.kind === "todo" ? "Task" : entry.kind === "read" ? "Readspace" : "Document",
      protectedFields: [
        { label: "title", ciphertext: entry.encrypted_title },
        { label: "content", ciphertext: entry.encrypted_content },
      ],
      metadata: [
        { label: "updated", value: entry.updated_at },
        { label: "tag count", value: String(entry.tag_ids.length) },
      ],
    }));
  const recentLists = [...lists]
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    .slice(0, 1)
    .map((list): LocalEncryptedPreviewItem => ({
      kind: "List",
      protectedFields: [{ label: "name", ciphertext: list.encrypted_name }],
      metadata: [{ label: "updated", value: list.updated_at }],
    }));

  return [
    ...recentBookmarks,
    ...recentEntries,
    ...recentLists,
    ...recentFolders,
    ...recentTags,
  ];
}

export async function createLocalBookmark(
  vaultId: string,
  input: CreateLocalBookmarkInput,
): Promise<string> {
  const db = await openLocalVault();
  const transaction = db.transaction([BOOKMARKS, TAGS, META], "readwrite");
  const bookmarkStore = transaction.objectStore(BOOKMARKS);
  const count = await requestResult(
    bookmarkStore.index(VAULT_ID_INDEX).count(vaultId),
  );
  if (count >= LOCAL_BOOKMARK_LIMIT) {
    transaction.abort();
    throw new Error(
      `Local bookmark limit reached. Create a free account to save more than ${LOCAL_BOOKMARK_LIMIT} bookmarks.`,
    );
  }

  const tagStore = transaction.objectStore(TAGS);
  const tagIds = [...new Set(input.existingTagIds)];
  const createdAt = new Date().toISOString();
  for (const encryptedName of input.newEncryptedTagNames) {
    const id = crypto.randomUUID();
    tagStore.put({
      id,
      vault_id: vaultId,
      encrypted_name: encryptedName,
      created_at: createdAt,
    } satisfies LocalTagRecord);
    tagIds.push(id);
  }

  const id = crypto.randomUUID();
  bookmarkStore.put({
    id,
    vault_id: vaultId,
    encrypted_title: input.encryptedTitle,
    encrypted_url: input.encryptedUrl,
    folder_id: input.folderId,
    tag_ids: tagIds,
    is_favorite: false,
    favorited_at: null,
    created_at: createdAt,
  } satisfies LocalBookmarkRecord);
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
  return id;
}

export async function createLocalExtensionBookmark(
  vaultId: string,
  input: CreateLocalExtensionBookmarkInput,
): Promise<string> {
  const db = await openLocalVault();
  const transaction = db.transaction(
    [BOOKMARKS, FOLDERS, TAGS, LISTS, LIST_ITEMS, META],
    "readwrite",
  );
  const bookmarkStore = transaction.objectStore(BOOKMARKS);
  const bookmarkCount = await requestResult(
    bookmarkStore.index(VAULT_ID_INDEX).count(vaultId),
  );
  if (!input.existingBookmarkId && bookmarkCount >= LOCAL_BOOKMARK_LIMIT) {
    transaction.abort();
    throw new Error(
      `Local bookmark limit reached. Create a free account to save more than ${LOCAL_BOOKMARK_LIMIT} bookmarks.`,
    );
  }
  const existingBookmark = input.existingBookmarkId
    ? (await requestResult(
        bookmarkStore.get(input.existingBookmarkId),
      )) as LocalBookmarkRecord | undefined
    : undefined;
  if (
    input.existingBookmarkId &&
    (!existingBookmark || existingBookmark.vault_id !== vaultId)
  ) {
    transaction.abort();
    throw new Error("The local bookmark could not be found.");
  }

  const folderStore = transaction.objectStore(FOLDERS);
  let folderId = input.folderId;
  if (folderId) {
    const folder = (await requestResult(folderStore.get(folderId))) as LocalFolderRecord | undefined;
    if (!folder || folder.vault_id !== vaultId) {
      transaction.abort();
      throw new Error("The selected local Collection could not be found.");
    }
  }
  const createdAt = new Date().toISOString();
  if (input.encryptedNewCollectionName) {
    const folders = (await requestResult(
      folderStore.index(VAULT_ID_INDEX).getAll(vaultId),
    )) as LocalFolderRecord[];
    folderId = crypto.randomUUID();
    folderStore.add({
      id: folderId,
      vault_id: vaultId,
      encrypted_name: input.encryptedNewCollectionName,
      color: null,
      parent_id: null,
      sort_order: folders.filter((folder) => folder.parent_id === null).length,
      created_at: createdAt,
    } satisfies LocalFolderRecord);
  }

  const tagStore = transaction.objectStore(TAGS);
  const tagIds = [...new Set(input.existingTagIds)];
  for (const tagId of tagIds) {
    const tag = (await requestResult(tagStore.get(tagId))) as LocalTagRecord | undefined;
    if (!tag || tag.vault_id !== vaultId) {
      transaction.abort();
      throw new Error("A selected local Tag could not be found.");
    }
  }
  for (const encryptedName of input.newEncryptedTagNames) {
    const id = crypto.randomUUID();
    tagStore.add({
      id,
      vault_id: vaultId,
      encrypted_name: encryptedName,
      created_at: createdAt,
    } satisfies LocalTagRecord);
    tagIds.push(id);
  }

  const listStore = transaction.objectStore(LISTS);
  const listIds = [...new Set(input.selectedListIds)];
  for (const listId of listIds) {
    const list = (await requestResult(listStore.get(listId))) as LocalListRecord | undefined;
    if (!list || list.vault_id !== vaultId) {
      transaction.abort();
      throw new Error("A selected local List could not be found.");
    }
  }
  const listCount = await requestResult(
    listStore.index(VAULT_ID_INDEX).count(vaultId),
  );
  if (input.encryptedNewListName) {
    if (LOCAL_LIST_LIMIT > 0 && listCount >= LOCAL_LIST_LIMIT) {
      transaction.abort();
      throw new Error(
        `Local List limit reached. Create a free account to use more than ${LOCAL_LIST_LIMIT} Lists.`,
      );
    }
    const id = crypto.randomUUID();
    listStore.add({
      id,
      vault_id: vaultId,
      encrypted_name: input.encryptedNewListName,
      created_at: createdAt,
      updated_at: createdAt,
    } satisfies LocalListRecord);
    listIds.push(id);
  }

  const bookmarkId = existingBookmark?.id ?? crypto.randomUUID();
  bookmarkStore.put({
    id: bookmarkId,
    vault_id: vaultId,
    encrypted_title: input.encryptedTitle,
    encrypted_url: existingBookmark?.encrypted_url ?? input.encryptedUrl,
    folder_id: folderId,
    tag_ids: tagIds,
    is_favorite: existingBookmark?.is_favorite ?? false,
    favorited_at: existingBookmark?.favorited_at ?? null,
    created_at: existingBookmark?.created_at ?? createdAt,
  } satisfies LocalBookmarkRecord);
  const itemStore = transaction.objectStore(LIST_ITEMS);
  const existingItems = (await requestResult(
    itemStore.index(VAULT_ID_INDEX).getAll(vaultId),
  )) as LocalListItemRecord[];
  for (const item of existingItems) {
    if (item.bookmark_id === bookmarkId) itemStore.delete(item.id);
  }
  for (const listId of listIds) {
    itemStore.add({
      id: localListItemId(listId, bookmarkId),
      vault_id: vaultId,
      list_id: listId,
      bookmark_id: bookmarkId,
      position: existingItems.filter(
        (item) => item.list_id === listId && item.bookmark_id !== bookmarkId,
      ).length,
      completed_at: null,
      created_at: createdAt,
    } satisfies LocalListItemRecord);
  }
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
  return bookmarkId;
}

export async function updateLocalBookmark(
  vaultId: string,
  bookmarkId: string,
  input: Omit<CreateLocalBookmarkInput, "encryptedUrl">,
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([BOOKMARKS, TAGS, META], "readwrite");
  const bookmarkStore = transaction.objectStore(BOOKMARKS);
  const current = (await requestResult(
    bookmarkStore.get(bookmarkId),
  )) as LocalBookmarkRecord | undefined;
  if (!current || current.vault_id !== vaultId) {
    transaction.abort();
    throw new Error("The local bookmark could not be found.");
  }
  const tagIds = [...new Set(input.existingTagIds)];
  const tagStore = transaction.objectStore(TAGS);
  for (const encryptedName of input.newEncryptedTagNames) {
    const id = crypto.randomUUID();
    tagStore.put({
      id,
      vault_id: vaultId,
      encrypted_name: encryptedName,
      created_at: new Date().toISOString(),
    } satisfies LocalTagRecord);
    tagIds.push(id);
  }
  bookmarkStore.put({
    ...current,
    encrypted_title: input.encryptedTitle,
    folder_id: input.folderId,
    tag_ids: tagIds,
  } satisfies LocalBookmarkRecord);
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

async function mutateLocalBookmark(
  vaultId: string,
  bookmarkId: string,
  mutate: (record: LocalBookmarkRecord) => LocalBookmarkRecord | null,
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([BOOKMARKS, LIST_ITEMS, META], "readwrite");
  const store = transaction.objectStore(BOOKMARKS);
  const current = (await requestResult(store.get(bookmarkId))) as
    | LocalBookmarkRecord
    | undefined;
  if (!current || current.vault_id !== vaultId) {
    transaction.abort();
    throw new Error("The local bookmark could not be found.");
  }
  const next = mutate(current);
  if (next) store.put(next);
  else {
    store.delete(bookmarkId);
    const itemStore = transaction.objectStore(LIST_ITEMS);
    const items = (await requestResult(
      itemStore.index(VAULT_ID_INDEX).getAll(vaultId),
    )) as LocalListItemRecord[];
    for (const item of items) {
      if (item.bookmark_id === bookmarkId) itemStore.delete(item.id);
    }
  }
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

export function deleteLocalBookmark(
  vaultId: string,
  bookmarkId: string,
): Promise<void> {
  return mutateLocalBookmark(vaultId, bookmarkId, () => null);
}

export function favoriteLocalBookmark(
  vaultId: string,
  bookmarkId: string,
  isFavorite: boolean,
): Promise<void> {
  return mutateLocalBookmark(vaultId, bookmarkId, (record) => ({
    ...record,
    is_favorite: isFavorite,
    favorited_at: isFavorite ? new Date().toISOString() : null,
  }));
}

export function moveLocalBookmark(
  vaultId: string,
  bookmarkId: string,
  folderId: string | null,
): Promise<void> {
  return mutateLocalBookmark(vaultId, bookmarkId, (record) => ({
    ...record,
    folder_id: folderId,
  }));
}

export async function createLocalFolder(
  vaultId: string,
  input: {
    encryptedName: string;
    color: ColorConstant | null;
    parentId: string | null;
    sortOrder: number;
  },
): Promise<Folder> {
  const db = await openLocalVault();
  const transaction = db.transaction([FOLDERS, META], "readwrite");
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  transaction.objectStore(FOLDERS).put({
    id,
    vault_id: vaultId,
    encrypted_name: input.encryptedName,
    color: input.color,
    parent_id: input.parentId,
    sort_order: input.sortOrder,
    created_at: createdAt,
  } satisfies LocalFolderRecord);
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
  return {
    id,
    user_id: vaultId,
    name: "",
    color: input.color,
    parent_id: input.parentId,
    sort_order: input.sortOrder,
    created_at: createdAt,
  };
}

export async function updateLocalFolder(
  vaultId: string,
  folderId: string,
  updates: { encryptedName?: string; color?: ColorConstant | null },
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([FOLDERS, META], "readwrite");
  const store = transaction.objectStore(FOLDERS);
  const current = (await requestResult(store.get(folderId))) as
    | LocalFolderRecord
    | undefined;
  if (!current || current.vault_id !== vaultId) {
    transaction.abort();
    throw new Error("The local Collection could not be found.");
  }
  store.put({
    ...current,
    ...(updates.encryptedName !== undefined
      ? { encrypted_name: updates.encryptedName }
      : {}),
    ...(updates.color !== undefined ? { color: updates.color } : {}),
  } satisfies LocalFolderRecord);
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

export async function arrangeLocalFolders(
  vaultId: string,
  placements: Array<{
    id: string;
    parentId: string | null;
    sortOrder: number;
  }>,
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([FOLDERS, META], "readwrite");
  const store = transaction.objectStore(FOLDERS);
  for (const placement of placements) {
    const current = (await requestResult(store.get(placement.id))) as
      | LocalFolderRecord
      | undefined;
    if (!current || current.vault_id !== vaultId) {
      transaction.abort();
      throw new Error("A local Collection could not be found.");
    }
    store.put({
      ...current,
      parent_id: placement.parentId,
      sort_order: placement.sortOrder,
    });
  }
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

export async function deleteLocalFolder(
  vaultId: string,
  folderId: string,
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([FOLDERS, BOOKMARKS, ENTRIES, META], "readwrite");
  const folderStore = transaction.objectStore(FOLDERS);
  const current = (await requestResult(folderStore.get(folderId))) as
    | LocalFolderRecord
    | undefined;
  if (!current || current.vault_id !== vaultId) {
    transaction.abort();
    throw new Error("The local Collection could not be found.");
  }
  folderStore.delete(folderId);
  const bookmarkStore = transaction.objectStore(BOOKMARKS);
  const bookmarks = (await requestResult(
    bookmarkStore.index(VAULT_ID_INDEX).getAll(vaultId),
  )) as LocalBookmarkRecord[];
  for (const bookmark of bookmarks) {
    if (bookmark.folder_id === folderId) {
      bookmarkStore.put({ ...bookmark, folder_id: null });
    }
  }
  const entryStore = transaction.objectStore(ENTRIES);
  const entries = (await requestResult(
    entryStore.index(VAULT_ID_INDEX).getAll(vaultId),
  )) as LocalEntryRecord[];
  for (const entry of entries) {
    if (entry.folder_id === folderId) entryStore.put({ ...entry, folder_id: null });
  }
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

export async function updateLocalTag(
  vaultId: string,
  tagId: string,
  encryptedName: string,
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([TAGS, META], "readwrite");
  const store = transaction.objectStore(TAGS);
  const current = (await requestResult(store.get(tagId))) as
    | LocalTagRecord
    | undefined;
  if (!current || current.vault_id !== vaultId) {
    transaction.abort();
    throw new Error("The local Tag could not be found.");
  }
  store.put({ ...current, encrypted_name: encryptedName });
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

export async function deleteLocalTag(
  vaultId: string,
  tagId: string,
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction([TAGS, BOOKMARKS, ENTRIES, META], "readwrite");
  const tagStore = transaction.objectStore(TAGS);
  const current = (await requestResult(tagStore.get(tagId))) as
    | LocalTagRecord
    | undefined;
  if (!current || current.vault_id !== vaultId) {
    transaction.abort();
    throw new Error("The local Tag could not be found.");
  }
  tagStore.delete(tagId);
  const bookmarkStore = transaction.objectStore(BOOKMARKS);
  const bookmarks = (await requestResult(
    bookmarkStore.index(VAULT_ID_INDEX).getAll(vaultId),
  )) as LocalBookmarkRecord[];
  for (const bookmark of bookmarks) {
    if (bookmark.tag_ids.includes(tagId)) {
      bookmarkStore.put({
        ...bookmark,
        tag_ids: bookmark.tag_ids.filter((id) => id !== tagId),
      });
    }
  }
  const entryStore = transaction.objectStore(ENTRIES);
  const entries = (await requestResult(
    entryStore.index(VAULT_ID_INDEX).getAll(vaultId),
  )) as LocalEntryRecord[];
  for (const entry of entries) {
    if (entry.tag_ids.includes(tagId)) {
      entryStore.put({ ...entry, tag_ids: entry.tag_ids.filter((id) => id !== tagId) });
    }
  }
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

export async function saveLocalPasskeyRecord(
  vaultId: string,
  record: PasskeyEncryptionRecord,
): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction(META, "readwrite");
  transaction.objectStore(META).put({
    key: `passkey:${vaultId}`,
    value: record,
  } satisfies LocalMetaRecord);
  await transactionDone(transaction);
}

export async function readLocalPasskeyRecord(
  vaultId: string,
): Promise<PasskeyEncryptionRecord | null> {
  const db = await openLocalVault();
  const transaction = db.transaction(META, "readonly");
  const record = (await requestResult(
    transaction.objectStore(META).get(`passkey:${vaultId}`),
  )) as LocalMetaRecord | undefined;
  await transactionDone(transaction);
  if (!record || typeof record.value !== "object" || record.value === null) {
    return null;
  }
  const value = record.value as PasskeyEncryptionRecord;
  return typeof value.credentialId === "string" &&
      typeof value.prfSalt === "string" &&
      typeof value.wrappedKey === "string"
    ? value
    : null;
}

export async function deleteLocalPasskeyRecord(vaultId: string): Promise<void> {
  const db = await openLocalVault();
  const transaction = db.transaction(META, "readwrite");
  transaction.objectStore(META).delete(`passkey:${vaultId}`);
  await transactionDone(transaction);
}

export async function restoreLocalVaultFromExport(
  vaultId: string,
  archive: FavLockExport,
  key: CryptoKey,
): Promise<void> {
  const bookmarks = archive.data.bookmarks ?? [];
  const lists = archive.data.lists ?? [];
  const notes = archive.data.notes ?? [];
  const todos = archive.data.todos ?? [];
  const readspace = archive.data.readspace ?? [];
  if (bookmarks.length > LOCAL_BOOKMARK_LIMIT) {
    throw new Error(
      `This backup has ${bookmarks.length.toLocaleString()} bookmarks, but a local vault allows ${LOCAL_BOOKMARK_LIMIT.toLocaleString()}.`,
    );
  }
  if (bookmarks.some((bookmark) => bookmark.collectionIds.length > 1)) {
    throw new Error(
      "This backup contains bookmarks in multiple Collections, which the local vault cannot restore yet.",
    );
  }
  if (notes.length + todos.length > LOCAL_ENTRY_LIMIT) {
    throw new Error(
      `This backup has ${(notes.length + todos.length).toLocaleString()} Documents and Tasks, but a local vault allows ${LOCAL_ENTRY_LIMIT.toLocaleString()} combined.`,
    );
  }
  if (readspace.length > LOCAL_READSPACE_LIMIT) {
    throw new Error(
      `This backup has ${readspace.length.toLocaleString()} Readspace items, but a local vault allows ${LOCAL_READSPACE_LIMIT.toLocaleString()}.`,
    );
  }
  if (LOCAL_LIST_LIMIT > 0 && lists.length > LOCAL_LIST_LIMIT) {
    throw new Error(
      `This backup has ${lists.length.toLocaleString()} Lists, but a local vault allows ${LOCAL_LIST_LIMIT.toLocaleString()}.`,
    );
  }

  const folderIds = new Map(
    archive.data.collections.map((folder) => [folder.id, crypto.randomUUID()]),
  );
  const tagIds = new Map(
    archive.data.tags.map((tag) => [tag.id, crypto.randomUUID()]),
  );
  const bookmarkIds = new Map(
    bookmarks.map((bookmark) => [bookmark.id, crypto.randomUUID()]),
  );
  const listIds = new Map(
    lists.map((list) => [list.id, crypto.randomUUID()]),
  );
  const folderRecords: LocalFolderRecord[] = await Promise.all(
    archive.data.collections.map(async (folder) => ({
      id: folderIds.get(folder.id)!,
      vault_id: vaultId,
      encrypted_name: await encryptField(folder.name, key),
      color: folder.color,
      parent_id: folder.parentId ? folderIds.get(folder.parentId) ?? null : null,
      sort_order: folder.sortOrder,
      created_at: folder.createdAt,
    })),
  );
  const tagRecords: LocalTagRecord[] = await Promise.all(
    archive.data.tags.map(async (tag) => ({
      id: tagIds.get(tag.id)!,
      vault_id: vaultId,
      encrypted_name: await encryptField(tag.name, key),
      created_at: tag.createdAt,
    })),
  );
  const bookmarkRecords: LocalBookmarkRecord[] = await Promise.all(
    bookmarks.map(async (bookmark) => ({
      id: bookmarkIds.get(bookmark.id)!,
      vault_id: vaultId,
      encrypted_title: await encryptField(bookmark.title, key),
      encrypted_url: await encryptField(bookmark.url, key),
      folder_id: bookmark.collectionIds[0]
        ? folderIds.get(bookmark.collectionIds[0]) ?? null
        : null,
      tag_ids: bookmark.tagIds.flatMap((tagId) => {
        const restoredId = tagIds.get(tagId);
        return restoredId ? [restoredId] : [];
      }),
      is_favorite: bookmark.isFavorite,
      favorited_at: bookmark.favoritedAt,
      created_at: bookmark.createdAt,
    })),
  );
  const entryRecords: LocalEntryRecord[] = await Promise.all([
    ...notes.map((entry) => ({ kind: "note" as const, entry })),
    ...todos.map((entry) => ({ kind: "todo" as const, entry })),
    ...readspace.map((entry) => ({ kind: "read" as const, entry })),
  ].map(async ({ kind, entry }) => ({
    id: crypto.randomUUID(),
    vault_id: vaultId,
    kind,
    encrypted_title: await encryptField(entry.title, key),
    encrypted_content: await encryptField(entry.content, key),
    folder_id: entry.collectionId ? folderIds.get(entry.collectionId) ?? null : null,
    tag_ids: entry.tagIds.flatMap((tagId) => {
      const restoredId = tagIds.get(tagId);
      return restoredId ? [restoredId] : [];
    }),
    is_completed: kind === "todo" ? entry.isCompleted : false,
    completed_at: kind === "todo" ? entry.completedAt : null,
    due_date: kind === "todo" ? entry.dueDate : null,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  })));
  const listRecords: LocalListRecord[] = await Promise.all(
    lists.map(async (list) => ({
      id: listIds.get(list.id)!,
      vault_id: vaultId,
      encrypted_name: await encryptField(list.name, key),
      created_at: list.createdAt,
      updated_at: list.updatedAt,
    })),
  );
  const listItemRecords: LocalListItemRecord[] = lists.flatMap((list) =>
    list.items.flatMap((item) => {
      const listId = listIds.get(list.id);
      const bookmarkId = bookmarkIds.get(item.bookmarkId);
      if (!listId || !bookmarkId) return [];
      return [{
        id: localListItemId(listId, bookmarkId),
        vault_id: vaultId,
        list_id: listId,
        bookmark_id: bookmarkId,
        position: item.position,
        completed_at: item.completedAt,
        created_at: item.createdAt,
      } satisfies LocalListItemRecord];
    }),
  );

  const db = await openLocalVault();
  const contentStores = [BOOKMARKS, FOLDERS, TAGS, ENTRIES, LISTS, LIST_ITEMS];
  const transaction = db.transaction(
    [...contentStores, META],
    "readwrite",
  );
  const counts = await Promise.all(
    contentStores.map((storeName) =>
      requestResult(
        transaction.objectStore(storeName).index(VAULT_ID_INDEX).count(vaultId),
      ),
    ),
  );
  if (counts.some((count) => count > 0)) {
    transaction.abort();
    throw new Error(
      "Restore is available only for an empty local vault. Export or remove its current data first.",
    );
  }

  const folderStore = transaction.objectStore(FOLDERS);
  const tagStore = transaction.objectStore(TAGS);
  const bookmarkStore = transaction.objectStore(BOOKMARKS);
  const entryStore = transaction.objectStore(ENTRIES);
  const listStore = transaction.objectStore(LISTS);
  const listItemStore = transaction.objectStore(LIST_ITEMS);
  for (const record of folderRecords) folderStore.add(record);
  for (const record of tagRecords) tagStore.add(record);
  for (const record of bookmarkRecords) bookmarkStore.add(record);
  for (const record of entryRecords) entryStore.add(record);
  for (const record of listRecords) listStore.add(record);
  for (const record of listItemRecords) listItemStore.add(record);
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
}

function localFolderPathKey(path: string[]): string {
  return JSON.stringify(path.map((segment) => segment.trim()));
}

export async function importLocalBookmarks(
  vaultId: string,
  items: LocalBookmarkImportItem[],
  key: CryptoKey,
): Promise<LocalBookmarkImportResult> {
  const existingFolders = await readLocalFolders(vaultId, key);
  const folderById = new Map(existingFolders.map((folder) => [folder.id, folder]));
  const folderIdByPath = new Map<string, string>();
  for (const folder of existingFolders) {
    const parent = folder.parent_id ? folderById.get(folder.parent_id) : null;
    const path = parent ? [parent.name, folder.name] : [folder.name];
    folderIdByPath.set(localFolderPathKey(path), folder.id);
  }

  const requiredPaths = new Map<string, string[]>();
  for (const item of items) {
    if (item.folderPath.length === 0) continue;
    const root = item.folderPath.slice(0, 1);
    requiredPaths.set(localFolderPathKey(root), root);
    requiredPaths.set(localFolderPathKey(item.folderPath), item.folderPath);
  }
  const sortedPaths = [...requiredPaths.values()].sort(
    (left, right) => left.length - right.length,
  );
  const createdAt = new Date().toISOString();
  const newFolders: LocalFolderRecord[] = [];
  for (const path of sortedPaths) {
    const pathKey = localFolderPathKey(path);
    if (folderIdByPath.has(pathKey)) continue;
    const id = crypto.randomUUID();
    const parentPath = path.slice(0, -1);
    const siblings = [
      ...existingFolders,
      ...newFolders.map((folder) => ({
        id: folder.id,
        parent_id: folder.parent_id,
        sort_order: folder.sort_order,
      })),
    ].filter(
      (folder) => folder.parent_id ===
        (parentPath.length > 0
          ? folderIdByPath.get(localFolderPathKey(parentPath)) ?? null
          : null),
    );
    const record: LocalFolderRecord = {
      id,
      vault_id: vaultId,
      encrypted_name: await encryptField(path[path.length - 1], key),
      color: null,
      parent_id: parentPath.length > 0
        ? folderIdByPath.get(localFolderPathKey(parentPath)) ?? null
        : null,
      sort_order: siblings.length,
      created_at: createdAt,
    };
    newFolders.push(record);
    folderIdByPath.set(pathKey, id);
  }

  const preparedItems = await Promise.all(
    items.map(async (item) => ({
      ...item,
      encryptedTitle: await encryptField(item.title, key),
      encryptedUrl: await encryptField(item.url, key),
      folderId: item.folderPath.length > 0
        ? folderIdByPath.get(localFolderPathKey(item.folderPath)) ?? null
        : null,
    })),
  );

  const db = await openLocalVault();
  const transaction = db.transaction(
    [BOOKMARKS, FOLDERS, META],
    "readwrite",
  );
  const bookmarkStore = transaction.objectStore(BOOKMARKS);
  const currentCount = await requestResult(
    bookmarkStore.index(VAULT_ID_INDEX).count(vaultId),
  );
  const additions = preparedItems.filter(
    (item) => !item.overwriteBookmarkId,
  ).length;
  if (currentCount + additions > LOCAL_BOOKMARK_LIMIT) {
    transaction.abort();
    throw new Error(
      `This import would exceed the ${LOCAL_BOOKMARK_LIMIT.toLocaleString()}-bookmark local limit. Choose Skip or Overwrite for more duplicates, or import a smaller file.`,
    );
  }

  const folderStore = transaction.objectStore(FOLDERS);
  for (const folder of newFolders) folderStore.add(folder);
  let added = 0;
  let overwritten = 0;
  for (const item of preparedItems) {
    if (item.overwriteBookmarkId) {
      const current = (await requestResult(
        bookmarkStore.get(item.overwriteBookmarkId),
      )) as LocalBookmarkRecord | undefined;
      if (!current || current.vault_id !== vaultId) {
        transaction.abort();
        throw new Error(
          "A duplicate bookmark changed before the import completed. Review the file again.",
        );
      }
      bookmarkStore.put({
        ...current,
        encrypted_title: item.encryptedTitle,
        encrypted_url: item.encryptedUrl,
        folder_id: item.folderId,
      } satisfies LocalBookmarkRecord);
      overwritten += 1;
      continue;
    }
    bookmarkStore.add({
      id: crypto.randomUUID(),
      vault_id: vaultId,
      encrypted_title: item.encryptedTitle,
      encrypted_url: item.encryptedUrl,
      folder_id: item.folderId,
      tag_ids: [],
      is_favorite: false,
      favorited_at: null,
      created_at: createdAt,
    } satisfies LocalBookmarkRecord);
    added += 1;
  }
  putRevision(transaction, vaultId);
  await transactionDone(transaction);
  return {
    added,
    overwritten,
    collectionsCreated: newFolders.length,
  };
}

export async function clearLocalVault(vaultId: string): Promise<void> {
  const db = await openLocalVault();
  const contentStores = [BOOKMARKS, FOLDERS, TAGS, ENTRIES, LISTS, LIST_ITEMS];
  const transaction = db.transaction(
    [...contentStores, META],
    "readwrite",
  );
  for (const storeName of contentStores) {
    const store = transaction.objectStore(storeName);
    const keys = await requestResult(
      store.index(VAULT_ID_INDEX).getAllKeys(vaultId),
    );
    for (const key of keys) store.delete(key);
  }
  transaction.objectStore(META).delete(`revision:${vaultId}`);
  transaction.objectStore(META).delete(`passkey:${vaultId}`);
  await transactionDone(transaction);
  notifyLocalVaultChanged(vaultId, "empty");
}
