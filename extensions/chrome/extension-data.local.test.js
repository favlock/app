import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getValidSession: vi.fn(),
  account: {
    userId: "11111111-1111-4111-8111-111111111111",
    cloudStatus: "local",
    epoch: "local-test",
  },
}));

vi.mock("./extension-auth.js", () => ({
  readLocalAccount: vi.fn(async () => authMocks.account),
  assertLocalAccount: vi.fn(async () => undefined),
  reportCloudFailure: vi.fn(async () => undefined),
  getValidSession: authMocks.getValidSession,
}));

vi.mock("./extension-crypto.js", () => ({
  decryptField: vi.fn(async (value) => String(value).replace(/^enc:/, "")),
  encryptField: vi.fn(async (value) => `enc:${value}`),
  loadLibraryKey: vi.fn(async () => ({ key: "local-library-key" })),
}));

import {
  loadQuickAddData,
  loadSavedPageState,
  loadSearchableBookmarks,
  saveCurrentPage,
} from "./extension-data.js";
import { FAVLOCK_CONFIG } from "./config.js";

describe("extension local vault handoff", () => {
  let sessionData;
  let localData;

  beforeEach(() => {
    sessionData = {};
    localData = {
      favlockLocalLibraryProjection: {
        version: 1,
        userId: authMocks.account.userId,
        revision: "1:test",
        generatedAt: "2026-09-02T10:00:00.000Z",
        folders: [{
          id: "22222222-2222-4222-8222-222222222222",
          encryptedName: "enc:Research",
          color: null,
          parentId: null,
          sortOrder: 0,
        }],
        tags: [{
          id: "33333333-3333-4333-8333-333333333333",
          encryptedName: "enc:private",
        }],
        lists: [{
          id: "44444444-4444-4444-8444-444444444444",
          encryptedName: "enc:Read later",
        }],
        bookmarks: [{
          id: "55555555-5555-4555-8555-555555555555",
          encryptedTitle: "enc:Example research",
          encryptedUrl: "enc:https://example.com/",
          folderId: "22222222-2222-4222-8222-222222222222",
          tagIds: ["33333333-3333-4333-8333-333333333333"],
          listIds: ["44444444-4444-4444-8444-444444444444"],
        }],
      },
    };
    authMocks.getValidSession.mockReset();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("chrome", {
      runtime: { id: "a".repeat(32) },
      storage: {
        local: {
          get: vi.fn(async () => ({ ...localData })),
        },
        session: {
          set: vi.fn(async (value) => Object.assign(sessionData, value)),
        },
      },
      tabs: { create: vi.fn().mockResolvedValue({}) },
    });
  });

  it("uses no cloud requests for local taxonomy and search state", async () => {
    await expect(loadQuickAddData()).resolves.toEqual({
      folders: [{
        id: "22222222-2222-4222-8222-222222222222",
        name: "Research",
        color: null,
        parent_id: null,
        sort_order: 0,
      }],
      tags: [{ id: "33333333-3333-4333-8333-333333333333", name: "private" }],
      lists: [{ id: "44444444-4444-4444-8444-444444444444", name: "Read later" }],
    });
    await expect(loadSavedPageState("https://example.com")).resolves.toEqual({
      id: "55555555-5555-4555-8555-555555555555",
      title: "Example research",
      folderId: "22222222-2222-4222-8222-222222222222",
      tagIds: ["33333333-3333-4333-8333-333333333333"],
      listIds: ["44444444-4444-4444-8444-444444444444"],
    });
    await expect(loadSearchableBookmarks({
      folders: [{ id: "22222222-2222-4222-8222-222222222222", name: "Research" }],
      tags: [{ id: "33333333-3333-4333-8333-333333333333", name: "private" }],
    })).resolves.toEqual([{
      id: "55555555-5555-4555-8555-555555555555",
      title: "Example research",
      url: "https://example.com/",
      collectionNames: ["Research"],
      tagNames: ["private"],
    }]);
    expect(fetch).not.toHaveBeenCalled();
    expect(authMocks.getValidSession).not.toHaveBeenCalled();
  });

  it("stores only a short-lived encrypted capture and opens the local dashboard", async () => {
    await expect(saveCurrentPage({
      title: "Private title",
      url: "https://example.com/private",
      existingBookmarkId: null,
      folderId: null,
      newCollectionName: "Research",
      selectedListIds: [],
      newListName: "Later",
      selectedTagIds: [],
      newTagNames: ["private"],
      folders: [],
      tags: [],
    })).resolves.toMatchObject({ pendingLocal: true });

    expect(fetch).not.toHaveBeenCalled();
    expect(authMocks.getValidSession).not.toHaveBeenCalled();
    const [storageKey] = Object.keys(sessionData);
    expect(storageKey).toMatch(/^localBookmarkCapture:/);
    expect(sessionData[storageKey]).toMatchObject({
      userId: authMocks.account.userId,
      encryptedTitle: "enc:Private title",
      encryptedUrl: "enc:https://example.com/private",
      encryptedNewCollectionName: "enc:Research",
      encryptedNewListName: "enc:Later",
      newEncryptedTagNames: ["enc:private"],
    });
    expect(sessionData[storageKey]).not.toHaveProperty("title");
    expect(sessionData[storageKey]).not.toHaveProperty("url");
    expect(sessionData[storageKey]).not.toHaveProperty("newCollectionName");
    const openedUrl = new URL(chrome.tabs.create.mock.calls[0][0].url);
    expect(openedUrl.origin).toBe(new URL(FAVLOCK_CONFIG.dashboardUrl).origin);
    expect(openedUrl.pathname).toBe("/extension/local-save");
    expect(openedUrl.searchParams.get("chromeExtensionId")).toBe(chrome.runtime.id);
    expect(openedUrl.search).not.toContain("Private");
  });
});
