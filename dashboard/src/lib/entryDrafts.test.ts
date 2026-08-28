import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { encryptField, importRawKey } from "./encryption";
import {
  clearEntryDraftsForUser, openEntryDraftLease, readEntryDrafts,
  removeEntryDraft, saveEntryDraft, type EntryDraft,
} from "./entryDrafts";

const draft = (userId = "user-1", id = "draft-1"): EntryDraft => ({
  id, userId, kind: "note", entryId: "note-1", updatedAt: 100,
  fields: { title: "Fictional title", content: "<p><strong>Fictional writing</strong></p>", selectedFolderId: "collection-1", dueDate: "", tags: ["fictional"] },
});

async function records(update?: (rows: Record<string, unknown>[]) => Record<string, unknown>[]) {
  const db = await new Promise<IDBDatabase>((resolve) => {
    const request = indexedDB.open("favlock-writing-drafts", 1);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const tx = db.transaction("drafts", update ? "readwrite" : "readonly");
      const store = tx.objectStore("drafts");
      const request = store.getAll();
      let rows: Record<string, unknown>[] = [];
      request.onsuccess = () => {
        rows = request.result;
        if (update) for (const row of update(rows)) store.put(row);
      };
      tx.oncomplete = () => resolve(rows);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

describe("encrypted writing drafts", () => {
  let key: CryptoKey;
  beforeEach(async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    key = await importRawKey("12345678901234567890123456789012");
  });

  it("persists only ciphertext for protected fields and recovers rich formatting", async () => {
    const lease = await openEntryDraftLease("user-1");
    await saveEntryDraft(lease, draft(), key);
    const stored = await records();
    expect(stored[0].ciphertext).toMatch(/^enc:/);
    expect(JSON.stringify(stored)).not.toContain("Fictional");
    expect(JSON.stringify(stored)).not.toContain("collection-1");
    expect(stored[0]).not.toHaveProperty("fields");
    const restored = await readEntryDrafts("user-1", "note", "note-1", key);
    expect(restored.unreadable).toBe(false);
    expect(restored.drafts[0].fields).toEqual(draft().fields);
  });

  it("isolates accounts, document IDs, kinds and simultaneous editing sessions", async () => {
    const lease = await openEntryDraftLease("user-1");
    await saveEntryDraft(lease, draft(), key);
    await saveEntryDraft(lease, { ...draft("user-1", "second-tab"), updatedAt: 200 }, key);
    await saveEntryDraft(await openEntryDraftLease("user-2"), draft("user-2", "other-account"), key);
    expect((await readEntryDrafts("user-1", "note", "note-1", key)).drafts.map((d) => d.id)).toEqual(["second-tab", "draft-1"]);
    expect((await readEntryDrafts("user-1", "todo", "note-1", key)).drafts).toEqual([]);
    expect((await readEntryDrafts("user-1", "note", null, key)).drafts).toEqual([]);
    await expect(saveEntryDraft(lease, draft("user-2"), key)).rejects.toThrow();
    await expect(saveEntryDraft(lease, draft("user-1", "other-account"), key)).rejects.toThrow();
    await removeEntryDraft(lease, "other-account");
    expect((await readEntryDrafts("user-2", "note", "note-1", key)).drafts).toHaveLength(1);
  });

  it("clears only the signed-out account and rejects late writes from all old leases", async () => {
    const lease = await openEntryDraftLease("user-1");
    const otherTab = await openEntryDraftLease("user-1");
    const otherAccount = await openEntryDraftLease("user-2");
    await saveEntryDraft(lease, draft(), key);
    await saveEntryDraft(otherAccount, draft("user-2", "other"), key);
    await clearEntryDraftsForUser("user-1");
    await expect(saveEntryDraft(lease, draft(), key)).rejects.toThrow();
    await expect(saveEntryDraft(otherTab, draft(), key)).rejects.toThrow();
    expect((await readEntryDrafts("user-1", "note", "note-1", key)).drafts).toEqual([]);
    expect((await readEntryDrafts("user-2", "note", "note-1", key)).drafts).toHaveLength(1);
    await saveEntryDraft(await openEntryDraftLease("user-1"), draft(), key);
    expect((await readEntryDrafts("user-1", "note", "note-1", key)).drafts).toHaveLength(1);
  });

  it("retains unreadable drafts instead of accepting plaintext or corrupted ciphertext", async () => {
    const lease = await openEntryDraftLease("user-1");
    await saveEntryDraft(lease, draft(), key);
    await records((rows) => [{ ...rows[0], ciphertext: JSON.stringify({ version: 1, ...draft() }) }]);
    expect(await readEntryDrafts("user-1", "note", "note-1", key)).toEqual({ drafts: [], unreadable: true });
    await records((rows) => [{ ...rows[0], ciphertext: "enc:corrupt" }]);
    expect(await readEntryDrafts("user-1", "note", "note-1", key)).toEqual({ drafts: [], unreadable: true });
    expect(await records()).toHaveLength(1);
  });

  it("rejects the wrong key and tampering with document metadata", async () => {
    await saveEntryDraft(await openEntryDraftLease("user-1"), draft(), key);
    const wrongKey = await importRawKey("abcdefghijklmnopqrstuvwxyzabcdef");
    expect((await readEntryDrafts("user-1", "note", "note-1", wrongKey)).unreadable).toBe(true);
    await records((rows) => [{ ...rows[0], entryId: "another-note" }]);
    expect(await readEntryDrafts("user-1", "note", "another-note", key)).toEqual({ drafts: [], unreadable: true });
  });

  it("validates decrypted shape and sanitizes recovered HTML", async () => {
    await saveEntryDraft(await openEntryDraftLease("user-1"), draft(), key);
    const invalid = await encryptField(JSON.stringify({ version: 1, ...draft(), fields: { ...draft().fields, tags: [null] } }), key);
    await records((rows) => [{ ...rows[0], ciphertext: invalid }]);
    expect((await readEntryDrafts("user-1", "note", "note-1", key)).unreadable).toBe(true);
    const unsafe = await encryptField(JSON.stringify({ version: 1, ...draft(), fields: { ...draft().fields, content: '<p>Safe</p><img src="https://example.com/tracker"><script>alert(1)</script>' } }), key);
    await records((rows) => [{ ...rows[0], ciphertext: unsafe }]);
    expect((await readEntryDrafts("user-1", "note", "note-1", key)).drafts[0].fields.content).toBe("<p>Safe</p>");
  });

  it("reports storage and size failures without replacing the previous recoverable draft", async () => {
    const lease = await openEntryDraftLease("user-1");
    await saveEntryDraft(lease, draft(), key);
    await expect(saveEntryDraft(lease, { ...draft(), fields: { ...draft().fields, content: "x".repeat(128 * 1024) } }, key)).rejects.toThrow("too large");
    expect((await readEntryDrafts("user-1", "note", "note-1", key)).drafts[0].fields).toEqual(draft().fields);
    vi.stubGlobal("indexedDB", undefined);
    await expect(openEntryDraftLease("user-1")).rejects.toThrow();
  });

  it("does not discard writing changed in another tab since the recovery prompt was loaded", async () => {
    const lease = await openEntryDraftLease("user-1");
    await saveEntryDraft(lease, draft(), key);
    await saveEntryDraft(lease, { ...draft(), updatedAt: 200 }, key);
    await expect(removeEntryDraft(lease, "draft-1", 100)).rejects.toThrow();
    expect((await readEntryDrafts("user-1", "note", "note-1", key)).drafts[0].updatedAt).toBe(200);
    await removeEntryDraft(lease, "draft-1", 200);
    expect((await readEntryDrafts("user-1", "note", "note-1", key)).drafts).toEqual([]);
  });

  it("refuses to evict older drafts when the local draft count limit is reached", async () => {
    const lease = await openEntryDraftLease("user-1");
    for (let index = 0; index < 50; index++) await saveEntryDraft(lease, draft("user-1", `draft-${index}`), key);
    await expect(saveEntryDraft(lease, draft("user-1", "overflow"), key)).rejects.toThrow();
    await saveEntryDraft(lease, { ...draft("user-1", "draft-0"), updatedAt: 200 }, key);
    expect((await readEntryDrafts("user-1", "note", "note-1", key)).drafts).toHaveLength(50);
  });
});
