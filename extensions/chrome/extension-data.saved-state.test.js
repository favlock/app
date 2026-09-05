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
  canAnnotateWebHighlights,
  deleteWebHighlight,
  loadQuickAddData,
  loadSearchableBookmarks,
  loadSavedPageState,
  loadWebHighlightsForUrl,
  saveCurrentPage,
  saveReadspaceArticle,
  saveWebHighlight,
  saveOpenTabsSession,
  serializeReaderArticle,
  updateWebHighlightAnnotation,
  updateWebHighlightColor,
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
      isHighlightSource: false,
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

  it("keeps hidden highlight sources out of extension bookmark search", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      data: {
        items: [{
          id: "source-1",
          encryptedTitle: "enc:Highlighted page",
          encryptedUrl: "enc:https://example.com/highlighted",
          isHighlightSource: true,
          folders: [],
          tags: [],
          listIds: [],
        }],
        nextCursor: null,
      },
    }));

    await expect(loadSearchableBookmarks()).resolves.toEqual([]);
  });

  it("encrypts and saves a Reader article directly to Readspace", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      data: { entryId: "123e4567-e89b-42d3-a456-426614174000" },
    }));
    const article = {
      title: "A useful article",
      siteName: "Example",
      byline: "Ada Author",
      publishedAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "",
      sourceUrl: "https://example.com/article",
      html: "<p>Useful text.</p>",
      capturedAt: "2026-09-04T10:00:00.000Z",
    };

    await expect(saveReadspaceArticle(article)).resolves.toEqual({
      entryId: "123e4567-e89b-42d3-a456-426614174000",
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${FAVLOCK_CONFIG.apiUrl}/v1/entries`);
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      kind: "read",
      encryptedTitle: "enc:A useful article",
      dueDate: null,
      folderId: null,
      existingTagIds: [],
      newEncryptedTagNames: [],
    });
    expect(body.encryptedContent).toBe(`enc:${serializeReaderArticle(article)}`);
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

  it("encrypts a highlight and attaches it to an existing bookmark", async () => {
    fetchMock.mockImplementation(async (url) => {
      const value = String(url);
      if (value.includes("/v1/library/bookmarks")) {
        return jsonResponse({
          data: {
            items: [{
              id: "bookmark-1",
              encryptedTitle: "enc:Example",
              encryptedUrl: "enc:https://example.com/article",
              folders: [],
              tags: [],
              listIds: [],
            }],
            nextCursor: null,
          },
        });
      }
      if (value.endsWith("/v1/highlights")) {
        return jsonResponse({ data: { highlightId: "highlight-1" } }, 201);
      }
      throw new Error(`Unexpected request: ${value}`);
    });

    await expect(saveWebHighlight({
      title: "Example",
      url: "https://example.com/article",
      payload: {
        quote: { exact: " private   passage ", prefix: "before", suffix: "after" },
        position: { start: 10, end: 25 },
        dom: null,
        color: "yellow",
        note: "",
        capturedAt: "2026-09-02T10:00:00.000Z",
      },
    })).resolves.toEqual({ highlightId: "highlight-1", bookmarkId: "bookmark-1" });

    const [, options] = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/v1/highlights"));
    const body = JSON.parse(options.body);
    expect(options.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(body).toEqual({
      bookmarkId: "bookmark-1",
      payload: {
        version: 1,
        encryptedQuote: expect.stringMatching(/^enc:/),
        encryptedAnchors: expect.stringMatching(/^enc:/),
        encryptedAnnotation: null,
        color: "yellow",
      },
    });
    expect(body).not.toHaveProperty("quote");
    expect(JSON.parse(body.payload.encryptedQuote.slice(4)).exact).toBe("private passage");
  });

  it("creates an internal source when highlighting an unsaved page", async () => {
    fetchMock.mockImplementation(async (url, options) => {
      const value = String(url);
      if (value.includes("/v1/library/bookmarks")) {
        return jsonResponse({ data: { items: [], nextCursor: null } });
      }
      if (value.endsWith("/v1/bookmarks/highlight-source")) {
        expect(JSON.parse(options.body)).toEqual({
          encryptedTitle: "enc:Example",
          encryptedUrl: "enc:https://example.com/article",
        });
        return jsonResponse({ data: { bookmarkId: "source-1" } }, 201);
      }
      if (value.endsWith("/v1/highlights")) {
        return jsonResponse({ data: { highlightId: "highlight-1" } }, 201);
      }
      throw new Error(`Unexpected request: ${value}`);
    });

    await expect(saveWebHighlight({
      title: "Example",
      url: "https://example.com/article",
      payload: {
        quote: { exact: "Private passage", prefix: "", suffix: "" },
        position: null,
        dom: null,
        color: "yellow",
        note: "",
        capturedAt: "2026-09-03T10:00:00.000Z",
      },
    })).resolves.toEqual({ highlightId: "highlight-1", bookmarkId: "source-1" });
  });

  it("shows the Free highlight allowance when the API rejects an over-limit save", async () => {
    fetchMock.mockImplementation(async (url) => {
      const value = String(url);
      if (value.includes("/v1/library/bookmarks")) {
        return jsonResponse({
          data: {
            items: [{
              id: "bookmark-1",
              encryptedTitle: "enc:Example",
              encryptedUrl: "enc:https://example.com/article",
              folders: [],
              tags: [],
              listIds: [],
            }],
            nextCursor: null,
          },
        });
      }
      if (value.endsWith("/v1/highlights")) {
        return jsonResponse({
          error: {
            code: "quota_exceeded",
            message: "Your current plan limit has been reached.",
            details: { resource: "highlights", limit: 100 },
          },
        }, 400);
      }
      throw new Error(`Unexpected request: ${value}`);
    });

    await expect(saveWebHighlight({
      title: "Example",
      url: "https://example.com/article",
      payload: {
        quote: { exact: "Private passage", prefix: "", suffix: "" },
        position: null,
        dom: null,
        color: "yellow",
        note: "",
        capturedAt: "2026-09-03T10:00:00.000Z",
      },
    })).rejects.toThrow(
      "Free includes up to 100 highlights. Upgrade to Pro for unlimited highlights.",
    );
  });

  it("decrypts only highlights attached to the current URL", async () => {
    fetchMock.mockImplementation(async (url) => {
      const value = String(url);
      if (value.includes("/v1/library/bookmarks")) {
        return jsonResponse({
          data: {
            items: [{
              id: "bookmark-current",
              encryptedTitle: "enc:Current page",
              encryptedUrl: "enc:https://example.com/current",
              folders: [],
              tags: [],
              listIds: [],
            }],
            nextCursor: null,
          },
        });
      }
      if (value.includes("/v1/highlights?")) {
        return jsonResponse({
          data: {
            items: [{
              id: "00000000-0000-4000-8000-000000000001",
              bookmarkId: "bookmark-current",
              payload: {
                version: 1,
                encryptedQuote: 'enc:{"exact":"Saved passage","prefix":"","suffix":""}',
                encryptedAnchors: 'enc:{"position":null,"dom":null,"capturedAt":"2026-09-02T10:00:00.000Z"}',
                encryptedAnnotation: "enc:Private thought",
                color: "green",
              },
            }],
            nextOffset: null,
          },
        });
      }
      throw new Error(`Unexpected request: ${value}`);
    });

    await expect(loadWebHighlightsForUrl("https://example.com/current")).resolves.toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          note: "Private thought",
          color: "green",
        }),
      }),
    ]);
  });

  it("does not load highlights when the current URL has no bookmark", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      data: { items: [], nextCursor: null },
    }));

    await expect(
      loadWebHighlightsForUrl("https://example.com/not-saved"),
    ).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deletes a validated highlight through the API", async () => {
    fetchMock.mockResolvedValue(jsonResponse(null, 204));

    await expect(
      deleteWebHighlight("00000000-0000-4000-8000-000000000001"),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      `${FAVLOCK_CONFIG.apiUrl}/v1/highlights/00000000-0000-4000-8000-000000000001`,
      expect.objectContaining({ method: "DELETE" }),
    );
    const [, options] = fetchMock.mock.calls[0];
    expect(options).not.toHaveProperty("body");
    expect(options.headers).not.toHaveProperty("Content-Type");
    await expect(deleteWebHighlight("not-an-id")).rejects.toThrow(
      "invalid highlight",
    );
  });

  it("checks Pro annotation access through the account plan API", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "pro" } }));

    await expect(canAnnotateWebHighlights()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      `${FAVLOCK_CONFIG.apiUrl}/v1/account/plan`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer access-token" }) }),
    );
  });

  it("encrypts annotation changes before updating a highlight", async () => {
    fetchMock.mockResolvedValue(jsonResponse(null, 204));
    const id = "00000000-0000-4000-8000-000000000001";

    await expect(updateWebHighlightAnnotation(id, "Private thought")).resolves.toBeUndefined();

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${FAVLOCK_CONFIG.apiUrl}/v1/highlights/${id}/annotation`,
    );
    expect(options.method).toBe("PUT");
    expect(body.encryptedAnnotation).toBe("enc:Private thought");
    expect(body).not.toHaveProperty("note");
  });

  it("updates a structured highlight with one of four plaintext colors", async () => {
    fetchMock.mockResolvedValue(jsonResponse(null, 204));
    const id = "00000000-0000-4000-8000-000000000001";

    await expect(updateWebHighlightColor(id, "pink")).resolves.toBeUndefined();

    const [, options] = fetchMock.mock.calls[0];
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${FAVLOCK_CONFIG.apiUrl}/v1/highlights/${id}/color`,
    );
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body)).toEqual({ color: "pink" });
    await expect(updateWebHighlightColor(id, "orange")).rejects.toThrow(
      "invalid highlight color",
    );
  });

});
