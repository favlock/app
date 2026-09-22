import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./authenticatedApi", () => ({ postAuthenticatedJson: mocks.post }));

import { clearCloudBookmarkUsage, flushCloudBookmarkUsage, queueCloudBookmarkOpen, readCloudBookmarkUsage, readCloudBookmarkUsageSnapshot, saveCloudBookmarkUsageSnapshot } from "./cloudBookmarkUsageQueue";

const userId = "10000000-0000-4000-8000-000000000001";
const otherUser = "10000000-0000-4000-8000-000000000002";
const first = "20000000-0000-4000-8000-000000000001";
const second = "20000000-0000-4000-8000-000000000002";

async function writeCountRow(row: object | null, key: string) {
  const request = indexedDB.open("favlock-bookmark-usage", 2);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const tx = db.transaction("counts", "readwrite");
    const finished = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    if (row) tx.objectStore("counts").put(row);
    else tx.objectStore("counts").delete(key);
    await finished;
  } finally { db.close(); }
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  mocks.post.mockReset().mockImplementation(async (_path, _token, body) => ({ data: { items: body.items.map((item: { bookmarkId: string; totalOpens: number }) => ({
    bookmarkId: item.bookmarkId, acceptedTotal: item.totalOpens,
  })) } }));
});

describe("cloud bookmark usage queue", () => {
  it("persists local totals and sends several changed IDs in one retry-safe batch", async () => {
    await queueCloudBookmarkOpen(userId, first);
    await queueCloudBookmarkOpen(userId, first);
    await queueCloudBookmarkOpen(userId, second);
    const local = await readCloudBookmarkUsage(userId);
    expect(local.totals).toEqual({ [first]: 2, [second]: 1 });
    expect(local.installationId).toMatch(/^[0-9a-f-]{36}$/);

    mocks.post.mockRejectedValueOnce(new Error("offline"));
    await expect(flushCloudBookmarkUsage(userId, "token")).rejects.toThrow("offline");
    expect((await readCloudBookmarkUsage(userId)).totals).toEqual(local.totals);

    await flushCloudBookmarkUsage(userId, "token");
    expect(mocks.post).toHaveBeenLastCalledWith("/v1/bookmarks/usage/batch", "token", {
      installationId: local.installationId,
      items: [{ bookmarkId: first, generationId: local.generations[first], totalOpens: 2 }, { bookmarkId: second, generationId: local.generations[second], totalOpens: 1 }],
    }, "Could not sync bookmark usage.");
    const calls = mocks.post.mock.calls.length;
    await flushCloudBookmarkUsage(userId, "token");
    expect(mocks.post).toHaveBeenCalledTimes(calls);
  });

  it("keeps opens arriving during a request pending and isolates account cleanup", async () => {
    await queueCloudBookmarkOpen(userId, first);
    await queueCloudBookmarkOpen(otherUser, second);
    mocks.post.mockImplementationOnce(async (_path, _token, body) => {
      await queueCloudBookmarkOpen(userId, first);
      return { data: { items: body.items.map((item: { bookmarkId: string; totalOpens: number }) => ({
        bookmarkId: item.bookmarkId, acceptedTotal: item.totalOpens,
      })) } };
    });
    await flushCloudBookmarkUsage(userId, "token");
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(mocks.post.mock.calls[0][2].items[0].totalOpens).toBe(1);
    expect(mocks.post.mock.calls[1][2].items[0].totalOpens).toBe(2);
    await clearCloudBookmarkUsage(userId);
    expect((await readCloudBookmarkUsage(userId)).totals).toEqual({});
    expect((await readCloudBookmarkUsage(otherUser)).totals).toEqual({ [second]: 1 });
  });

  it("starts a fresh counter generation when one IndexedDB row is lost", async () => {
    await queueCloudBookmarkOpen(userId, first);
    await flushCloudBookmarkUsage(userId, "token");
    const original = await readCloudBookmarkUsage(userId);
    await writeCountRow(null, `${userId}:${first}`);
    await queueCloudBookmarkOpen(userId, first);
    const replacement = await readCloudBookmarkUsage(userId);
    expect(replacement.generations[first]).not.toBe(original.generations[first]);
    await flushCloudBookmarkUsage(userId, "token");
    expect(mocks.post.mock.calls[1][2].items).toEqual([{
      bookmarkId: first, generationId: replacement.generations[first], totalOpens: 1,
    }]);
  });

  it("removes an invalid pending row without blocking the valid batch", async () => {
    await queueCloudBookmarkOpen(userId, first);
    await queueCloudBookmarkOpen(userId, second);
    await writeCountRow({ key: `${userId}:${first}`, userId, bookmarkId: first, generationId: crypto.randomUUID(),
      totalOpens: -1, syncedOpens: 0, pendingUserId: userId }, `${userId}:${first}`);
    await flushCloudBookmarkUsage(userId, "token");
    expect(mocks.post.mock.calls[0][2].items).toEqual([{
      bookmarkId: second, generationId: expect.any(String), totalOpens: 1,
    }]);
    expect((await readCloudBookmarkUsage(userId)).totals).toEqual({ [second]: 1 });
  });

  it("retains pending opens when the server acknowledgment is malformed", async () => {
    await queueCloudBookmarkOpen(userId, first);
    mocks.post.mockResolvedValueOnce({ data: { items: [{ bookmarkId: first, acceptedTotal: -1 }] } });
    await expect(flushCloudBookmarkUsage(userId, "token")).rejects.toThrow("Could not sync bookmark usage.");
    expect((await readCloudBookmarkUsage(userId)).pending[first]).toBe(1);
    await flushCloudBookmarkUsage(userId, "token");
    expect((await readCloudBookmarkUsage(userId)).pending[first]).toBe(0);
  });

  it("keeps the offline aggregate account scoped and clears it on signout", async () => {
    const snapshot = { items: { [first]: { count: 12, baselineTotal: 2, baselineGenerationId: crypto.randomUUID() } } };
    const installation = (await readCloudBookmarkUsage(userId)).installationId;
    await saveCloudBookmarkUsageSnapshot(userId, installation, snapshot);
    expect(await readCloudBookmarkUsageSnapshot(userId)).toEqual(snapshot);
    expect(await readCloudBookmarkUsageSnapshot(otherUser)).toBeNull();
    await clearCloudBookmarkUsage(userId);
    expect(await readCloudBookmarkUsageSnapshot(userId)).toBeNull();
    await saveCloudBookmarkUsageSnapshot(userId, installation, snapshot);
    expect(await readCloudBookmarkUsageSnapshot(userId)).toBeNull();
  });
});
