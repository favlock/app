import { FAVLOCK_CONFIG } from "./config.js";
import { assertLocalAccount, getValidSession, readLocalAccount } from "./extension-auth.js";

const DB_NAME = "favlock-extension-bookmark-usage";
const ALARM = "favlock-bookmark-usage-sync";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let flushPromise = null;

function validRow(row, userId) {
  return row && typeof row === "object" && typeof row.bookmarkId === "string" && UUID.test(row.bookmarkId) &&
    typeof row.generationId === "string" && UUID.test(row.generationId) &&
    row.key === `${userId}:${row.bookmarkId}` && row.userId === userId &&
    Number.isSafeInteger(row.totalOpens) && row.totalOpens >= 1 &&
    Number.isSafeInteger(row.syncedOpens) && row.syncedOpens >= 0 && row.syncedOpens <= row.totalOpens &&
    row.pendingUserId === (row.totalOpens > row.syncedOpens ? userId : "");
}

function readAcknowledgments(payload, pending) {
  const items = payload?.data?.items;
  if (!Array.isArray(items) || items.length !== pending.length) throw new Error("Bookmark usage sync failed.");
  const expected = new Set(pending.map((row) => row.bookmarkId.toLowerCase()));
  const accepted = new Map();
  for (const item of items) {
    if (!item || typeof item.bookmarkId !== "string" || !expected.delete(item.bookmarkId.toLowerCase()) ||
      (item.acceptedTotal !== null && (!Number.isSafeInteger(item.acceptedTotal) || item.acceptedTotal < 1)))
      throw new Error("Bookmark usage sync failed.");
    accepted.set(item.bookmarkId.toLowerCase(), item.acceptedTotal);
  }
  return accepted;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const counts = db.createObjectStore("counts", { keyPath: "key" });
      counts.createIndex("userId", "userId");
      counts.createIndex("pendingUserId", "pendingUserId");
      db.createObjectStore("installations", { keyPath: "userId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function queueBookmarkOpen(bookmarkId) {
  if (!UUID.test(bookmarkId)) return;
  const account = await readLocalAccount();
  if (!account) return;
  const db = await openDb();
  try {
    const tx = db.transaction(["counts", "installations"], "readwrite");
    const committed = done(tx);
    const installations = tx.objectStore("installations");
    const installation = installations.get(account.userId);
    installation.onsuccess = () => {
      if (!installation.result) installations.put({ userId: account.userId, installationId: crypto.randomUUID() });
    };
    const counts = tx.objectStore("counts");
    const key = `${account.userId}:${bookmarkId}`;
    const request = counts.get(key);
    request.onsuccess = () => {
      const previous = validRow(request.result, account.userId) ? request.result : null;
      if (previous?.totalOpens === Number.MAX_SAFE_INTEGER) return;
      counts.put({ key, userId: account.userId, bookmarkId, generationId: previous?.generationId ?? crypto.randomUUID(),
        totalOpens: (previous?.totalOpens ?? 0) + 1,
        syncedOpens: previous?.syncedOpens ?? 0, pendingUserId: account.userId });
    };
    await committed;
    await assertLocalAccount(account);
    await scheduleBookmarkUsageSync().catch(() => {});
  } finally { db.close(); }
}

export async function scheduleBookmarkUsageSync() {
  const alarms = globalThis.chrome?.alarms;
  if (!alarms) return;
  const account = await readLocalAccount();
  if (!account) return;
  const db = await openDb();
  let pending;
  try {
    const tx = db.transaction("counts", "readonly");
    const committed = done(tx);
    const request = tx.objectStore("counts").index("pendingUserId").getKey(account.userId);
    await committed;
    pending = request.result !== undefined;
  } finally { db.close(); }
  if (pending && !(await alarms.get(ALARM))) await alarms.create(ALARM, { delayInMinutes: 1 });
}

export function isBookmarkUsageAlarm(name) { return name === ALARM; }

export function flushBookmarkUsage() {
  if (flushPromise) return flushPromise;
  flushPromise = flushPending().finally(async () => {
    flushPromise = null;
    await scheduleBookmarkUsageSync().catch(() => {});
  });
  return flushPromise;
}

async function flushPending() {
  const account = await readLocalAccount();
  if (!account) return;
  const session = await getValidSession();
  if (!session || session.userId !== account.userId) return;
  const db = await openDb();
  try {
    while (true) {
      const tx = db.transaction(["counts", "installations"], "readonly");
      const committed = done(tx);
      const installation = tx.objectStore("installations").get(account.userId);
      const rows = tx.objectStore("counts").index("pendingUserId").getAll(account.userId, 100);
      await committed;
      const allPending = rows.result;
      const pending = allPending.filter((row) => validRow(row, account.userId));
      if (pending.length !== allPending.length) {
        const clean = db.transaction("counts", "readwrite");
        const cleanCommitted = done(clean);
        const counts = clean.objectStore("counts");
        for (const row of allPending) if (!validRow(row, account.userId) && row && "key" in row) counts.delete(row.key);
        await cleanCommitted;
      }
      if (!pending.length && allPending.length) continue;
      const installationId = installation.result?.installationId;
      if (!installationId || !pending.length) return;
      const seen = new Set();
      const batch = pending.filter((row) => {
        const id = row.bookmarkId.toLowerCase();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      await assertLocalAccount(account);
      const response = await fetch(`${FAVLOCK_CONFIG.apiUrl}/v1/bookmarks/usage/batch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ installationId, items: batch.map(({ bookmarkId, generationId, totalOpens }) => ({ bookmarkId, generationId, totalOpens })) }),
        credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status !== 200) throw new Error("Bookmark usage sync failed.");
      const accepted = readAcknowledgments(await response.json(), batch);
      await assertLocalAccount(account);
      const ack = db.transaction("counts", "readwrite");
      const ackCommitted = done(ack);
      const counts = ack.objectStore("counts");
      for (const sent of batch) {
        const current = counts.get(sent.key);
        current.onsuccess = () => {
          const row = current.result;
          if (!row || row.generationId !== sent.generationId) return;
          const acceptedTotal = accepted.get(sent.bookmarkId.toLowerCase());
          if (acceptedTotal === null) { counts.delete(sent.key); return; }
          if (acceptedTotal === undefined) return;
          if (acceptedTotal > row.totalOpens) row.totalOpens = acceptedTotal;
          row.syncedOpens = Math.max(row.syncedOpens, acceptedTotal);
          row.pendingUserId = row.totalOpens > row.syncedOpens ? account.userId : "";
          counts.put(row);
        };
      }
      await ackCommitted;
    }
  } finally { db.close(); }
}

export async function clearBookmarkUsage(userId) {
  const db = await openDb();
  try {
    const tx = db.transaction(["counts", "installations"], "readwrite");
    const committed = done(tx);
    tx.objectStore("installations").delete(userId);
    const cursor = tx.objectStore("counts").index("userId").openCursor(userId);
    cursor.onsuccess = () => {
      if (!cursor.result) return;
      cursor.result.delete();
      cursor.result.continue();
    };
    await committed;
  } finally { db.close(); }
}
