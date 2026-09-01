import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./extension-auth.js", () => ({
  readLocalAccount: vi.fn(async () => ({ userId: "user-1", epoch: "test" })),
  assertLocalAccount: vi.fn(async () => undefined),
  reportCloudFailure: vi.fn(async () => undefined),
  getValidSession: vi.fn(async () => ({
    accessToken: "access-token",
    userId: "user-1",
  })),
}));

vi.mock("./extension-crypto.js", () => ({
  decryptField: vi.fn(async (value) => String(value).replace(/^enc:/, "")),
  encryptField: vi.fn(async (value) => `enc:${value}`),
  loadLibraryKey: vi.fn(async () => ({ key: "library-key" })),
}));

import {
  loadQuickAddData,
  loadSearchableBookmarks,
  loadSavedPageState,
  saveCurrentPage,
  saveOpenTabsSession,
} from "./extension-data.js";
import { FAVLOCK_CONFIG } from "./config.js";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => payload),
  };
}

describe("extension saved-page state", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("loads encrypted Quick Save taxonomy through paginated API routes", async () => {
    fetchMock.mockImplementation(async (url) => {
      const value = String(url);
      if (value.includes("/v1/library/folders")) {
        return jsonResponse({
          data: {
            items: [
              {
                id: "folder-1",
                encryptedName: "enc:Research",
                color: "BLUE",
                parentId: null,
                sortOrder: 2,
              },
            ],
            nextCursor: null,
          },
        });
      }
      if (value.includes("/v1/library/tags")) {
        return jsonResponse({
          data: {
            items: [{ id: "tag-1", encryptedName: "enc:privacy" }],
            nextCursor: null,
          },
        });
      }
      return jsonResponse({
        data: {
          items: [{ id: "list-1", encryptedName: "enc:Later" }],
          nextCursor: null,
        },
      });
    });

    await expect(loadQuickAddData()).resolves.toEqual({
      folders: [
        {
          id: "folder-1",
          name: "Research",
          color: "BLUE",
          parent_id: null,
          sort_order: 2,
        },
      ],
      tags: [{ id: "tag-1", name: "privacy" }],
      lists: [{ id: "list-1", name: "Later" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(String(url).startsWith(`${FAVLOCK_CONFIG.apiUrl}/v1/`)).toBe(true);
      expect(options.headers.Authorization).toBe("Bearer access-token");
      expect(options.headers.apikey).toBeUndefined();
    }
  });

  it("loads the saved title, Collection, tags, and Lists for the current URL", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          items: [
            {
              id: "bookmark-1",
              encryptedTitle: "enc:Saved title",
              encryptedUrl: "enc:https://example.com/",
              folders: [{ id: "folder-1" }],
              tags: [{ id: "tag-1" }, { id: "tag-2" }],
              listIds: ["list-1", "list-2"],
            },
          ],
          nextCursor: null,
        },
      }),
    );

    await expect(loadSavedPageState("https://example.com")).resolves.toEqual({
      id: "bookmark-1",
      title: "Saved title",
      folderId: "folder-1",
      tagIds: ["tag-1", "tag-2"],
      listIds: ["list-1", "list-2"],
    });
  });

  it("loads searchable bookmarks by decrypting safe titles and URLs in memory", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          items: [
            {
              id: "bookmark-1",
              encryptedTitle: "enc:Research notes",
              encryptedUrl: "enc:https://example.com/research",
              folders: [{ id: "folder-1" }],
              tags: [{ id: "tag-1" }, { id: "tag-2" }],
            },
            {
              id: "bookmark-2",
              encryptedTitle: "enc:Restricted page",
              encryptedUrl: "enc:chrome://settings",
            },
          ],
          nextCursor: null,
        },
      }),
    );

    await expect(
      loadSearchableBookmarks({
        folders: [{ id: "folder-1", name: "Research" }],
        tags: [
          { id: "tag-1", name: "privacy" },
          { id: "tag-2", name: "reference" },
        ],
      }),
    ).resolves.toEqual([
      {
        id: "bookmark-1",
        title: "Research notes",
        url: "https://example.com/research",
        collectionNames: ["Research"],
        tagNames: ["privacy", "reference"],
      },
    ]);
  });

  it("updates an existing bookmark and replaces its List memberships", async () => {
    fetchMock.mockResolvedValue(jsonResponse(null, 204));

    await expect(
      saveCurrentPage({
        title: "Updated title",
        url: "https://example.com",
        existingBookmarkId: "bookmark-1",
        folderId: "folder-2",
        newCollectionName: "",
        selectedListIds: ["list-2", "list-3"],
        newListName: "",
        selectedTagIds: ["tag-1"],
        newTagNames: [],
        folders: [],
        tags: [{ id: "tag-1", name: "research" }],
      }),
    ).resolves.toEqual({ bookmarkId: "bookmark-1", updatedExisting: true });

    const requests = fetchMock.mock.calls.map(([url, options]) => ({
      url: String(url),
      body: JSON.parse(options.body),
    }));
    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe(
      `${FAVLOCK_CONFIG.apiUrl}/v1/bookmarks/bookmark-1`,
    );
    expect(requests[0].body).toEqual({
      encryptedTitle: "enc:Updated title",
      folderId: "folder-2",
      existingTagIds: ["tag-1"],
      newEncryptedTagNames: [],
    });
    expect(requests[1].url).toBe(
      `${FAVLOCK_CONFIG.apiUrl}/v1/bookmarks/bookmark-1/lists`,
    );
    expect(requests[1].body).toEqual({
      listIds: ["list-2", "list-3"],
    });
    expect(
      requests.some(({ url }) => url.includes("supabase.co/rest/v1")),
    ).toBe(false);
  });

  it("saves a tab session without exposing table or RPC paths", async () => {
    fetchMock.mockImplementation(async (url, options) => {
      const value = String(url);
      if (value.includes("/v1/library/bookmarks")) {
        return jsonResponse({
          data: {
            items: [
              {
                id: "bookmark-existing",
                encryptedTitle: "enc:Existing",
                encryptedUrl: "enc:https://existing.example/",
                folders: [],
                tags: [],
                listIds: [],
              },
            ],
            nextCursor: null,
          },
        });
      }
      if (value.endsWith("/v1/bookmarks")) {
        return jsonResponse({ data: { bookmarkId: "bookmark-new" } }, 201);
      }
      if (value.endsWith("/v1/tags/tag-1/bookmarks")) {
        return jsonResponse(null, 204);
      }
      throw new Error(`Unexpected request: ${value} ${options?.method}`);
    });

    await expect(
      saveOpenTabsSession({
        tabs: [
          { title: "Existing", url: "https://existing.example" },
          { title: "New", url: "https://new.example" },
        ],
        sessionTagName: "Session",
        tags: [{ id: "tag-1", name: "session" }],
      }),
    ).resolves.toMatchObject({ created: 1, tagged: 1, failed: 0, total: 2 });

    const requests = fetchMock.mock.calls.map(([url, options]) => ({
      url: String(url),
      method: options.method || "GET",
      body: options.body ? JSON.parse(options.body) : null,
    }));
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: `${FAVLOCK_CONFIG.apiUrl}/v1/bookmarks`,
          method: "POST",
          body: expect.objectContaining({
            existingTagIds: ["tag-1"],
            newEncryptedTagNames: [],
          }),
        }),
        {
          url: `${FAVLOCK_CONFIG.apiUrl}/v1/tags/tag-1/bookmarks`,
          method: "POST",
          body: { bookmarkIds: ["bookmark-existing"] },
        },
      ]),
    );
    expect(requests.map(({ url }) => url).join(" ")).not.toMatch(
      /supabase|\/rest\/v1|\/rpc\//,
    );
  });
});
