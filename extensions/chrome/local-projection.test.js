import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCAL_PROJECTION_KEY,
  normalizeLocalProjection,
  readLocalProjection,
  writeLocalProjection,
} from "./local-projection.js";

const userId = "11111111-1111-4111-8111-111111111111";
const folderId = "22222222-2222-4222-8222-222222222222";
const tagId = "33333333-3333-4333-8333-333333333333";
const listId = "44444444-4444-4444-8444-444444444444";

function projection() {
  return {
    version: 1,
    userId,
    revision: "1:test",
    generatedAt: "2026-09-02T10:00:00.000Z",
    folders: [{ id: folderId, encryptedName: "enc:folder", color: null, parentId: null, sortOrder: 0 }],
    tags: [{ id: tagId, encryptedName: "enc:tag" }],
    lists: [{ id: listId, encryptedName: "enc:list" }],
    bookmarks: [{
      id: "55555555-5555-4555-8555-555555555555",
      encryptedTitle: "enc:title",
      encryptedUrl: "enc:url",
      folderId,
      tagIds: [tagId],
      listIds: [listId],
    }],
  };
}

describe("encrypted local extension projection", () => {
  let stored;

  beforeEach(() => {
    stored = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async () => ({ ...stored })),
          set: vi.fn(async (value) => Object.assign(stored, value)),
        },
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("stores a bounded account-bound ciphertext projection", async () => {
    await expect(writeLocalProjection(projection(), userId)).resolves.toEqual(projection());
    expect(JSON.stringify(stored)).not.toContain("Private title");
    await expect(readLocalProjection(userId)).resolves.toEqual(projection());
    expect(stored[LOCAL_PROJECTION_KEY].bookmarks[0]).toEqual(expect.objectContaining({
      encryptedTitle: "enc:title",
      encryptedUrl: "enc:url",
    }));
  });

  it("rejects projections for another account or with broken references", () => {
    expect(normalizeLocalProjection(projection(), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBeNull();
    const broken = projection();
    broken.bookmarks[0].tagIds = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"];
    expect(normalizeLocalProjection(broken, userId)).toBeNull();
  });
});
