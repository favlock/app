import { describe, expect, it, vi } from "vitest";
vi.mock("./authenticatedApi", () => ({ postAuthenticatedJson: vi.fn() }));
import { postAuthenticatedJson } from "./authenticatedApi";
import { editCloudBookmarkBatch, runBookmarkBulkEdit } from "./bookmarkBulk";

describe("bulk bookmark dispatch", () => {
  it("freezes IDs, bounds requests, and preserves per-item failures", async () => {
    const ids = Array.from({ length: 205 }, (_, i) => `id-${i}`);
    const write = vi.fn(async (batch: string[]) => {
      ids.push("new-arrival");
      return batch.map((bookmarkId) => ({ bookmarkId, status: bookmarkId === "id-4" ? "tag-limit" as const : "updated" as const }));
    });
    const progress = vi.fn();
    const results = await runBookmarkBulkEdit(ids, write, () => {}, progress);
    expect(write.mock.calls.map(([batch]) => batch.length)).toEqual([100, 100, 5]);
    expect(results).toHaveLength(205);
    expect(results[4].status).toBe("tag-limit");
    expect(progress).toHaveBeenLastCalledWith(205, results);
  });
  it("stops dispatch after transport failure, preserving completed batches", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => String(i));
    const write = vi.fn().mockImplementationOnce(async (batch: string[]) => batch.map((bookmarkId) => ({ bookmarkId, status: "updated" }))).mockRejectedValue(new Error("offline"));
    const results = await runBookmarkBulkEdit(ids, write, () => {}, () => {});
    expect(write).toHaveBeenCalledTimes(2);
    expect(results.filter((item) => item.status === "updated")).toHaveLength(100);
    expect(results.filter((item) => item.status === "failed")).toHaveLength(150);
  });
  it("stops new batches when the vault changes", async () => {
    let current = true;
    const write = vi.fn(async (batch: string[]) => { current = false; return batch.map((bookmarkId) => ({ bookmarkId, status: "updated" as const })); });
    await expect(runBookmarkBulkEdit(Array.from({ length: 200 }, (_, i) => String(i)), write, () => { if (!current) throw new Error("changed"); }, () => {})).rejects.toThrow("changed");
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("sends only IDs and explicit actions, and rejects unexpected result IDs", async () => {
    vi.mocked(postAuthenticatedJson).mockResolvedValueOnce({ data: { items: [{ bookmarkId: "one", status: "updated" }] } });
    expect(await editCloudBookmarkBatch("token", ["one"], { action: "remove-tags", tagIds: ["tag"] })).toEqual([{ bookmarkId: "one", status: "updated" }]);
    expect(postAuthenticatedJson).toHaveBeenCalledWith("/v1/bookmarks/bulk", "token", { bookmarkIds: ["one"], action: "remove-tags", tagIds: ["tag"] }, expect.any(String));
    vi.mocked(postAuthenticatedJson).mockResolvedValueOnce({ data: { items: [{ bookmarkId: "other", status: "updated" }] } });
    await expect(editCloudBookmarkBatch("token", ["one"], { action: "favorite" })).rejects.toThrow();
  });
});
