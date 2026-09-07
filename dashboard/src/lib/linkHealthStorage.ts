import type { LinkHealthStatus } from "./linkHealthApi";

const DB_NAME = "favlock-library-health";
const DB_VERSION = 1;
const RESULT_STORE = "link-results";
const USER_ID_INDEX = "user_id";

export interface StoredLinkHealthResult {
  bookmarkId: string;
  checkedAt: string;
  status: LinkHealthStatus;
  statusCode?: number;
  urlKey: string;
  userId: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(RESULT_STORE, {
        keyPath: ["userId", "bookmarkId"],
      });
      store.createIndex(USER_ID_INDEX, "userId", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readLinkHealthResults(
  userId: string,
): Promise<StoredLinkHealthResult[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(RESULT_STORE)
      .objectStore(RESULT_STORE)
      .index(USER_ID_INDEX)
      .getAll(userId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function writeLinkHealthResults(
  results: StoredLinkHealthResult[],
): Promise<void> {
  if (results.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(RESULT_STORE, "readwrite");
    const store = transaction.objectStore(RESULT_STORE);
    for (const result of results) store.put(result);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function deleteLinkHealthResults(
  userId: string,
  bookmarkIds: readonly string[],
): Promise<void> {
  if (bookmarkIds.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(RESULT_STORE, "readwrite");
    const store = transaction.objectStore(RESULT_STORE);
    for (const bookmarkId of bookmarkIds) store.delete([userId, bookmarkId]);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function pruneLinkHealthResults(
  userId: string,
  bookmarkIds: ReadonlySet<string>,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(RESULT_STORE, "readwrite");
    const request = transaction
      .objectStore(RESULT_STORE)
      .index(USER_ID_INDEX)
      .openCursor(userId);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const result = cursor.value as StoredLinkHealthResult;
      if (!bookmarkIds.has(result.bookmarkId)) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function clearLinkHealthResults(userId: string): Promise<void> {
  await pruneLinkHealthResults(userId, new Set());
}
