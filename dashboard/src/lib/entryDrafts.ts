import { decryptFieldStrict, encryptField, ENC_PREFIX } from "./encryption";
import { sanitizeEntryHtml } from "./entryContent";

export type EntryDraftFields = {
  title: string;
  content: string;
  selectedFolderId: string;
  dueDate: string;
  tags: string[];
};

export type EntryDraft = {
  id: string;
  userId: string;
  kind: string;
  entryId: string | null;
  updatedAt: number;
  fields: EntryDraftFields;
};

type StoredDraft = Omit<EntryDraft, "fields"> & { ciphertext: string };
export type DraftLease = { userId: string; generation: string };
const DB_NAME = "favlock-writing-drafts";
const MAX_BYTES = 128 * 1024;
const MAX_DRAFTS = 50;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("accounts");
      const store = request.result.createObjectStore("drafts", { keyPath: "id" });
      store.createIndex("userId", "userId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Draft storage is unavailable."));
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(new Error("Could not store this draft."));
  });
}

export async function openEntryDraftLease(userId: string): Promise<DraftLease> {
  const db = await openDb();
  try {
    const generation = await result(db.transaction("accounts").objectStore("accounts").get(userId));
    return { userId, generation: typeof generation === "string" ? generation : "" };
  } finally {
    db.close();
  }
}

// The generation is checked in the same transaction as every mutation. A late
// encryption operation, even in another tab, cannot repopulate signed-out data.
async function mutateDrafts(
  lease: DraftLease,
  change: (store: IDBObjectStore) => void,
): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(["accounts", "drafts"], "readwrite");
    const done = completed(tx);
    const request = tx.objectStore("accounts").get(lease.userId);
    request.onsuccess = () => {
      if ((request.result ?? "") !== lease.generation) {
        tx.abort();
        return;
      }
      change(tx.objectStore("drafts"));
    };
    await done;
  } finally {
    db.close();
  }
}

export async function saveEntryDraft(lease: DraftLease, draft: EntryDraft, key: CryptoKey): Promise<void> {
  if (draft.userId !== lease.userId) throw new Error("Draft account changed.");
  const plain = JSON.stringify({ version: 1, ...draft });
  if (new TextEncoder().encode(plain).byteLength > MAX_BYTES) {
    throw new Error("This draft is too large for local recovery. Shorten it or copy your writing before closing.");
  }
  const ciphertext = await encryptField(plain, key);
  const { fields: _fields, ...metadata } = draft;
  void _fields;
  decodeDraft({ version: 1, ...draft }, { ...metadata, ciphertext });
  await mutateDrafts(lease, (store) => {
    const existing = store.get(draft.id);
    existing.onsuccess = () => {
      if (existing.result && existing.result.userId !== lease.userId) {
        store.transaction.abort();
        return;
      }
      const request = store.index("userId").getAllKeys(lease.userId);
      request.onsuccess = () => {
        if (request.result.length >= MAX_DRAFTS && !request.result.includes(draft.id)) {
          store.transaction.abort();
          return;
        }
        store.put({ ...metadata, ciphertext } satisfies StoredDraft);
      };
    };
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeDraft(value: unknown, record: StoredDraft): EntryDraft {
  if (!isObject(value) || value.version !== 1 || value.id !== record.id ||
      value.userId !== record.userId || value.kind !== record.kind ||
      value.entryId !== record.entryId || value.updatedAt !== record.updatedAt || !isObject(value.fields)) {
    throw new Error("Invalid draft.");
  }
  const fields = value.fields;
  if (typeof fields.title !== "string" || fields.title.length > 120 ||
      typeof fields.content !== "string" || typeof fields.selectedFolderId !== "string" ||
      typeof fields.dueDate !== "string" || !Array.isArray(fields.tags) || fields.tags.length > 10 ||
      !fields.tags.every((tag): tag is string => typeof tag === "string" && tag.length <= 120)) {
    throw new Error("Invalid draft.");
  }
  return { id: record.id, userId: record.userId, kind: record.kind,
    entryId: record.entryId, updatedAt: record.updatedAt, fields: {
    title: fields.title, content: sanitizeEntryHtml(fields.content),
    selectedFolderId: fields.selectedFolderId, dueDate: fields.dueDate, tags: fields.tags,
  } };
}

export async function readEntryDrafts(
  userId: string, kind: string, entryId: string | null, key: CryptoKey,
): Promise<{ drafts: EntryDraft[]; unreadable: boolean }> {
  const db = await openDb();
  let records: unknown[];
  try {
    records = await result(db.transaction("drafts").objectStore("drafts").index("userId").getAll(userId));
  } finally {
    db.close();
  }
  const drafts: EntryDraft[] = [];
  let unreadable = false;
  for (const record of records) {
    if (!isObject(record) || record.kind !== kind || record.entryId !== entryId) continue;
    try {
      if (record.userId !== userId || typeof record.id !== "string" || typeof record.updatedAt !== "number" ||
          !Number.isFinite(record.updatedAt) || typeof record.ciphertext !== "string" ||
          !record.ciphertext.startsWith(ENC_PREFIX) || record.ciphertext.length > MAX_BYTES * 2) {
        throw new Error("Invalid draft.");
      }
      const plain = await decryptFieldStrict(record.ciphertext, key);
      if (new TextEncoder().encode(plain).byteLength > MAX_BYTES) throw new Error("Invalid draft.");
      drafts.push(decodeDraft(JSON.parse(plain), record as StoredDraft));
    } catch {
      unreadable = true;
    }
  }
  return { drafts: drafts.sort((a, b) => b.updatedAt - a.updatedAt), unreadable };
}

export async function removeEntryDraft(lease: DraftLease, id: string, expectedUpdatedAt?: number): Promise<void> {
  await mutateDrafts(lease, (store) => {
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result?.userId !== lease.userId) return;
      if (expectedUpdatedAt !== undefined && request.result.updatedAt !== expectedUpdatedAt) {
        store.transaction.abort();
        return;
      }
      store.delete(id);
    };
  });
}

export async function clearEntryDraftsForUser(userId: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(["accounts", "drafts"], "readwrite");
    const done = completed(tx);
    tx.objectStore("accounts").put(crypto.randomUUID(), userId);
    const request = tx.objectStore("drafts").index("userId").openCursor(userId);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    await done;
  } finally {
    db.close();
  }
}
