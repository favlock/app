import { postAuthenticatedJson } from "./authenticatedApi";

const DB_NAME = "favlock-bookmark-usage";
const DB_VERSION = 2;
const COUNTS = "counts";
const INSTALLATIONS = "installations";
const SNAPSHOTS = "snapshots";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface UsageRow {
  key: string;
  userId: string;
  bookmarkId: string;
  generationId: string;
  totalOpens: number;
  syncedOpens: number;
  pendingUserId: string;
}

export interface UsageSnapshotItem { count: number; baselineTotal: number; baselineGenerationId: string | null }
export interface UsageSnapshot {
  items: Record<string, UsageSnapshotItem>;
}

function validRow(value: unknown, userId: string): value is UsageRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<UsageRow>;
  return typeof row.bookmarkId === "string" && UUID.test(row.bookmarkId) &&
    typeof row.generationId === "string" && UUID.test(row.generationId) &&
    row.key === `${userId}:${row.bookmarkId}` && row.userId === userId &&
    Number.isSafeInteger(row.totalOpens) && (row.totalOpens ?? 0) >= 1 &&
    Number.isSafeInteger(row.syncedOpens) && (row.syncedOpens ?? -1) >= 0 &&
    (row.syncedOpens ?? 0) <= (row.totalOpens ?? 0) &&
    row.pendingUserId === ((row.totalOpens ?? 0) > (row.syncedOpens ?? 0) ? userId : "");
}

function readAcknowledgments(payload: unknown, pending: UsageRow[]): Map<string, number | null> {
  const data = payload && typeof payload === "object" && "data" in payload ? payload.data : null;
  const items = data && typeof data === "object" && "items" in data ? data.items : null;
  if (!Array.isArray(items) || items.length !== pending.length) throw new Error("Could not sync bookmark usage.");
  const expected = new Set(pending.map((row) => row.bookmarkId.toLowerCase()));
  const accepted = new Map<string, number | null>();
  for (const item of items) {
    if (!item || typeof item !== "object" || typeof item.bookmarkId !== "string" ||
      !expected.delete(item.bookmarkId.toLowerCase()) ||
      (item.acceptedTotal !== null && (!Number.isSafeInteger(item.acceptedTotal) || item.acceptedTotal < 1)))
      throw new Error("Could not sync bookmark usage.");
    accepted.set(item.bookmarkId.toLowerCase(), item.acceptedTotal);
  }
  return accepted;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(COUNTS)) {
        const counts = db.createObjectStore(COUNTS, { keyPath: "key" });
        counts.createIndex("userId", "userId");
        counts.createIndex("pendingUserId", "pendingUserId");
      }
      if (!db.objectStoreNames.contains(INSTALLATIONS)) db.createObjectStore(INSTALLATIONS, { keyPath: "userId" });
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: "userId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function queueCloudBookmarkOpen(userId: string, bookmarkId: string): Promise<void> {
  if (!UUID.test(userId) || !UUID.test(bookmarkId)) return;
  const db = await openDb();
  try {
    const tx = db.transaction([COUNTS, INSTALLATIONS], "readwrite");
    const done = transactionDone(tx);
    const installationStore = tx.objectStore(INSTALLATIONS);
    const installation = installationStore.get(userId);
    installation.onsuccess = () => {
      if (!installation.result) installationStore.put({ userId, installationId: crypto.randomUUID() });
    };
    const store = tx.objectStore(COUNTS);
    const key = `${userId}:${bookmarkId}`;
    const request = store.get(key);
    request.onsuccess = () => {
      const row = validRow(request.result, userId) ? request.result as UsageRow : undefined;
      if (row?.totalOpens === Number.MAX_SAFE_INTEGER) return;
      const totalOpens = (row?.totalOpens ?? 0) + 1;
      store.put({ key, userId, bookmarkId, generationId: row?.generationId ?? crypto.randomUUID(), totalOpens,
        syncedOpens: row?.syncedOpens ?? 0, pendingUserId: userId } satisfies UsageRow);
    };
    await done;
  } finally { db.close(); }
}

export async function readCloudBookmarkUsage(userId: string): Promise<{
  installationId: string | null;
  totals: Record<string, number>;
  pending: Record<string, number>;
  generations: Record<string, string>;
}> {
  const db = await openDb();
  try {
    const tx = db.transaction([COUNTS, INSTALLATIONS], "readwrite");
    const done = transactionDone(tx);
    const installationStore = tx.objectStore(INSTALLATIONS);
    const installation = installationStore.get(userId);
    let installationId: string | null = null;
    installation.onsuccess = () => {
      installationId = installation.result?.installationId ?? crypto.randomUUID();
      if (!installation.result) installationStore.put({ userId, installationId });
    };
    const rows = tx.objectStore(COUNTS).index("userId").getAll(userId);
    await done;
    const validRows = (rows.result as unknown[]).filter((row): row is UsageRow => validRow(row, userId));
    return {
      installationId,
      totals: Object.fromEntries(validRows.map((row) => [row.bookmarkId, row.totalOpens])),
      pending: Object.fromEntries(validRows.map((row) => [row.bookmarkId, row.totalOpens - row.syncedOpens])),
      generations: Object.fromEntries(validRows.map((row) => [row.bookmarkId, row.generationId])),
    };
  } finally { db.close(); }
}

export async function readCloudBookmarkUsageSnapshot(userId: string): Promise<UsageSnapshot | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(SNAPSHOTS, "readonly");
    const done = transactionDone(tx);
    const request = tx.objectStore(SNAPSHOTS).get(userId);
    await done;
    const snapshot = request.result as (UsageSnapshot & { userId: string }) | undefined;
    if (!snapshot || snapshot.userId !== userId ||
      !snapshot.items || typeof snapshot.items !== "object" || Array.isArray(snapshot.items)) return null;
    for (const [id, item] of Object.entries(snapshot.items)) {
      if (!UUID.test(id) || !item || !Number.isSafeInteger(item.count) || item.count < 0 ||
        !Number.isSafeInteger(item.baselineTotal) || item.baselineTotal < 0 ||
        (item.baselineGenerationId !== null && (typeof item.baselineGenerationId !== "string" || !UUID.test(item.baselineGenerationId)))) return null;
    }
    return { items: snapshot.items };
  } finally { db.close(); }
}

export async function saveCloudBookmarkUsageSnapshot(userId: string, expectedInstallationId: string | null, snapshot: UsageSnapshot): Promise<void> {
  if (!expectedInstallationId) return;
  const db = await openDb();
  try {
    const tx = db.transaction([INSTALLATIONS, SNAPSHOTS], "readwrite");
    const done = transactionDone(tx);
    const installation = tx.objectStore(INSTALLATIONS).get(userId);
    installation.onsuccess = () => {
      if (installation.result?.installationId === expectedInstallationId) tx.objectStore(SNAPSHOTS).put({ userId, ...snapshot });
    };
    await done;
  } finally { db.close(); }
}

const flushing = new Map<string, Promise<boolean>>();

export function flushCloudBookmarkUsage(userId: string, accessToken: string): Promise<boolean> {
  const existing = flushing.get(userId);
  if (existing) return existing;
  const task = flushPending(userId, accessToken).finally(() => flushing.delete(userId));
  flushing.set(userId, task);
  return task;
}

async function flushPending(userId: string, accessToken: string): Promise<boolean> {
  const db = await openDb();
  try {
    let sentAny = false;
    while (true) {
      const tx = db.transaction([COUNTS, INSTALLATIONS], "readonly");
      const done = transactionDone(tx);
      const installation = tx.objectStore(INSTALLATIONS).get(userId);
      const rows = tx.objectStore(COUNTS).index("pendingUserId").getAll(userId, 100);
      await done;
      const installationId = installation.result?.installationId as string | undefined;
      const allPending = rows.result as unknown[];
      const pending = allPending.filter((row): row is UsageRow => validRow(row, userId));
      if (pending.length !== allPending.length) {
        const clean = db.transaction(COUNTS, "readwrite");
        const cleanDone = transactionDone(clean);
        const store = clean.objectStore(COUNTS);
        for (const row of allPending) {
          if (!validRow(row, userId) && row && typeof row === "object" && "key" in row) store.delete(row.key as IDBValidKey);
        }
        await cleanDone;
      }
      if (pending.length === 0 && allPending.length > 0) continue;
      if (!installationId || pending.length === 0) return sentAny;
      const seen = new Set<string>();
      const batch = pending.filter((row) => {
        const id = row.bookmarkId.toLowerCase();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      const payload = await postAuthenticatedJson("/v1/bookmarks/usage/batch", accessToken, {
        installationId,
        items: batch.map(({ bookmarkId, generationId, totalOpens }) => ({ bookmarkId, generationId, totalOpens })),
      }, "Could not sync bookmark usage.");
      const accepted = readAcknowledgments(payload, batch);
      sentAny = true;

      const ack = db.transaction(COUNTS, "readwrite");
      const ackDone = transactionDone(ack);
      const store = ack.objectStore(COUNTS);
      for (const sent of batch) {
        const current = store.get(sent.key);
        current.onsuccess = () => {
          const row = current.result as UsageRow | undefined;
          if (!row || row.generationId !== sent.generationId) return;
          const acceptedTotal = accepted.get(sent.bookmarkId.toLowerCase());
          if (acceptedTotal === null) { store.delete(sent.key); return; }
          if (acceptedTotal === undefined) return;
          if (acceptedTotal > row.totalOpens) row.totalOpens = acceptedTotal;
          row.syncedOpens = Math.max(row.syncedOpens, acceptedTotal);
          row.pendingUserId = row.totalOpens > row.syncedOpens ? userId : "";
          store.put(row);
        };
      }
      await ackDone;
    }
  } finally { db.close(); }
}

export async function clearCloudBookmarkUsage(userId: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction([COUNTS, INSTALLATIONS, SNAPSHOTS], "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(INSTALLATIONS).delete(userId);
    tx.objectStore(SNAPSHOTS).delete(userId);
    const cursor = tx.objectStore(COUNTS).index("userId").openCursor(userId);
    cursor.onsuccess = () => {
      if (!cursor.result) return;
      cursor.result.delete();
      cursor.result.continue();
    };
    await done;
  } finally { db.close(); }
}
