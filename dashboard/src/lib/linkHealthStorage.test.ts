import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  pruneLinkHealthResults,
  clearLinkHealthResults,
  deleteLinkHealthResults,
  readLinkHealthResults,
  writeLinkHealthResults,
} from "./linkHealthStorage";

describe("link health storage", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
  });

  it("persists incremental results and prunes removed bookmarks by user", async () => {
    await writeLinkHealthResults([
      { bookmarkId: "keep", checkedAt: "2026-09-07T08:00:00.000Z", status: "working", statusCode: 200, urlKey: "https://example.com/", userId: "user-1" },
      { bookmarkId: "remove", checkedAt: "2026-09-07T08:00:00.000Z", status: "broken", statusCode: 404, urlKey: "https://example.com/missing", userId: "user-1" },
      { bookmarkId: "other", checkedAt: "2026-09-07T08:00:00.000Z", status: "broken", urlKey: "https://other.example/", userId: "user-2" },
    ]);

    await pruneLinkHealthResults("user-1", new Set(["keep"]));
    expect((await readLinkHealthResults("user-1")).map((item) => item.bookmarkId)).toEqual(["keep"]);
    expect((await readLinkHealthResults("user-2")).map((item) => item.bookmarkId)).toEqual(["other"]);
  });

  it("clears one user's results on sign-out", async () => {
    await writeLinkHealthResults([
      { bookmarkId: "one", checkedAt: "2026-09-07T08:00:00.000Z", status: "working", urlKey: "https://example.com/", userId: "user-1" },
      { bookmarkId: "two", checkedAt: "2026-09-07T08:00:00.000Z", status: "working", urlKey: "https://other.example/", userId: "user-2" },
    ]);
    await clearLinkHealthResults("user-1");
    expect(await readLinkHealthResults("user-1")).toEqual([]);
    expect(await readLinkHealthResults("user-2")).toHaveLength(1);
  });

  it("deletes selected results without affecting another user", async () => {
    await writeLinkHealthResults([
      { bookmarkId: "one", checkedAt: "2026-09-07T08:00:00.000Z", status: "broken", urlKey: "https://one.example/", userId: "user-1" },
      { bookmarkId: "two", checkedAt: "2026-09-07T08:00:00.000Z", status: "broken", urlKey: "https://two.example/", userId: "user-1" },
      { bookmarkId: "one", checkedAt: "2026-09-07T08:00:00.000Z", status: "broken", urlKey: "https://one.example/", userId: "user-2" },
    ]);

    await deleteLinkHealthResults("user-1", ["one"]);

    expect((await readLinkHealthResults("user-1")).map((item) => item.bookmarkId)).toEqual(["two"]);
    expect((await readLinkHealthResults("user-2")).map((item) => item.bookmarkId)).toEqual(["one"]);
  });
});
