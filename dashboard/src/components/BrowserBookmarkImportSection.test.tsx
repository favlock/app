import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrowserBookmarkImportSection from "./BrowserBookmarkImportSection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  decryptField: vi.fn(async (value: string) => value),
  encryptField: vi.fn(async (value: string) => value),
  createFolder: vi.fn(),
  createBookmark: vi.fn(),
  moveBookmarkToFolder: vi.fn(),
  overwriteBookmarkImportContent: vi.fn(),
  getCachedBookmarksForUser: vi.fn(),
  invalidateQueries: vi.fn(),
  refetchAccountPlan: vi.fn(),
  refetchResourceUsage: vi.fn(),
  retryBookmarkCacheSync: vi.fn(),
  resourceUsage: { bookmarks: 0, collections: 0 },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    session: { access_token: "current.jwt.token" },
    retryBookmarkCacheSync: mocks.retryBookmarkCacheSync,
  }),
}));
vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({
    cryptoKey: {},
    decryptField: mocks.decryptField,
    encryptField: mocks.encryptField,
    keyLoading: false,
  }),
}));
vi.mock("../hooks/useFoldersQuery", () => ({
  useFolders: () => ({ data: [], isLoading: false }),
}));
vi.mock("../hooks/useAccountPlanQuery", () => ({
  useAccountPlan: () => ({
    data: {
      limits: { bookmarks: 1000, collections: 100 },
    },
    refetch: mocks.refetchAccountPlan,
  }),
}));
vi.mock("../hooks/useResourceUsageQuery", () => ({
  RESOURCE_USAGE_QUERY_KEY: ["resource-usage"],
  useResourceUsage: () => ({
    data: mocks.resourceUsage,
    refetch: mocks.refetchResourceUsage,
  }),
}));
vi.mock("../lib/bookmarkCache", () => ({
  getCachedBookmarksForUser: mocks.getCachedBookmarksForUser,
}));
vi.mock("../lib/taxonomyRepository", () => ({
  createFolder: mocks.createFolder,
}));
vi.mock("../lib/bookmarkRepository", () => ({
  createBookmark: mocks.createBookmark,
  moveBookmarkToFolder: mocks.moveBookmarkToFolder,
  overwriteBookmarkImportContent: mocks.overwriteBookmarkImportContent,
}));

describe("BrowserBookmarkImportSection Chrome extension launch", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.decryptField.mockClear();
    mocks.encryptField.mockClear();
    mocks.createFolder.mockReset().mockResolvedValue({
      folderId: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-08-20T09:00:00.000Z",
    });
    mocks.createBookmark.mockReset().mockResolvedValue(
      "22222222-2222-4222-8222-222222222222",
    );
    mocks.moveBookmarkToFolder.mockReset().mockResolvedValue(undefined);
    mocks.overwriteBookmarkImportContent
      .mockReset()
      .mockResolvedValue(undefined);
    mocks.getCachedBookmarksForUser.mockReset().mockResolvedValue([]);
    mocks.invalidateQueries.mockReset();
    mocks.refetchAccountPlan.mockReset();
    mocks.refetchResourceUsage.mockReset();
    mocks.retryBookmarkCacheSync.mockReset();
    mocks.resourceUsage.bookmarks = 0;
    mocks.resourceUsage.collections = 0;
    window.history.replaceState({}, "", "/settings");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("automatically requests Chrome bookmarks after an extension launch", async () => {
    const extensionId = "a".repeat(32);
    const extensionOrigin = `chrome-extension://${extensionId}`;
    window.history.replaceState(
      {},
      "",
      `/settings?chromeExtensionId=${extensionId}&autoImport=chrome#import-bookmarks`,
    );

    await act(async () => {
      root.render(
        <BrowserRouter>
          <BrowserBookmarkImportSection />
        </BrowserRouter>,
      );
    });

    const bridge = container.querySelector("iframe")!;
    const postMessage = vi.spyOn(bridge.contentWindow!, "postMessage");

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "FAVLOCK_CHROME_EXTENSION_READY" },
          origin: extensionOrigin,
          source: bridge.contentWindow,
        }),
      );
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "FAVLOCK_CHROME_BOOKMARKS_REQUEST",
        requestId: expect.any(String),
      }),
      extensionOrigin,
    );
    expect(new URLSearchParams(window.location.search).has("autoImport")).toBe(
      false,
    );
    expect(window.location.hash).toBe("#import-bookmarks");
  });

  it("waits for a click when the extension did not request auto-import", async () => {
    const extensionId = "b".repeat(32);
    const extensionOrigin = `chrome-extension://${extensionId}`;
    window.history.replaceState(
      {},
      "",
      `/settings?chromeExtensionId=${extensionId}#import-bookmarks`,
    );

    await act(async () => {
      root.render(
        <BrowserRouter>
          <BrowserBookmarkImportSection />
        </BrowserRouter>,
      );
    });

    const bridge = container.querySelector("iframe")!;
    const postMessage = vi.spyOn(bridge.contentWindow!, "postMessage");

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "FAVLOCK_CHROME_EXTENSION_READY" },
          origin: extensionOrigin,
          source: bridge.contentWindow,
        }),
      );
    });

    expect(postMessage).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Import from Chrome");
  });

  it("reviews duplicates before writing and can skip all of them", async () => {
    mockBookmarkQueries([
      { id: "existing-1", title: "Existing one", url: "https://one.test/" },
      { id: "existing-2", title: "Existing two", url: "https://two.test/" },
    ]);
    const { bridge, extensionOrigin, requestId } = await launchChromeImport();

    await sendChromeBookmarks(bridge, extensionOrigin, requestId, [
      { title: "Imported one", url: "https://one.test" },
      { title: "Imported two", url: "https://two.test" },
    ]);

    expect(document.body.textContent).toContain("Duplicate bookmark found");
    expect(document.body.textContent).toContain("Duplicate 1 of 2");
    expect(mocks.overwriteBookmarkImportContent).not.toHaveBeenCalled();
    expect(mocks.moveBookmarkToFolder).not.toHaveBeenCalled();

    const applyToAll = document.body.querySelector<HTMLElement>(
      '[role="checkbox"]',
    )!;
    await act(async () => applyToAll.click());
    await clickDialogButton("Skip");

    expect(document.body.textContent).toContain(
      "0 added, 0 overwritten, 2 duplicates skipped",
    );
    expect(mocks.overwriteBookmarkImportContent).not.toHaveBeenCalled();
    expect(mocks.moveBookmarkToFolder).not.toHaveBeenCalled();
  });

  it("overwrites the existing bookmark only after confirmation", async () => {
    mockBookmarkQueries([
      {
        id: "existing-1",
        title: "Old title",
        url: "https://example.test/",
      },
    ]);
    const { bridge, extensionOrigin, requestId } = await launchChromeImport();

    await sendChromeBookmarks(bridge, extensionOrigin, requestId, [
      { title: "Imported title", url: "https://example.test" },
    ]);
    expect(mocks.overwriteBookmarkImportContent).not.toHaveBeenCalled();

    await clickDialogButton("Overwrite");

    expect(mocks.overwriteBookmarkImportContent).toHaveBeenCalledWith(
      "current.jwt.token",
      "existing-1",
      "Imported title",
      "https://example.test/",
    );
    expect(mocks.moveBookmarkToFolder).toHaveBeenCalledWith(
      "current.jwt.token",
      "existing-1",
      null,
    );
    expect(document.body.textContent).toContain(
      "0 added, 1 overwritten, 0 duplicates skipped",
    );
  });

  it("keeps both bookmarks only after confirmation", async () => {
    mockBookmarkQueries([
      {
        id: "existing-1",
        title: "Existing title",
        url: "https://example.test/",
      },
    ]);
    const { bridge, extensionOrigin, requestId } = await launchChromeImport();

    await sendChromeBookmarks(bridge, extensionOrigin, requestId, [
      { title: "Imported title", url: "https://example.test" },
    ]);
    expect(mocks.createBookmark).not.toHaveBeenCalled();

    await clickDialogButton("Keep both");

    expect(mocks.createBookmark).toHaveBeenCalledWith("current.jwt.token", {
      title: "Imported title",
      url: "https://example.test/",
      folderId: null,
      existingTagIds: [],
      newEncryptedTagNames: [],
    });
    expect(mocks.overwriteBookmarkImportContent).not.toHaveBeenCalled();
    expect(mocks.moveBookmarkToFolder).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "1 added, 0 overwritten, 0 duplicates skipped",
    );
  });

  it("creates imported Collections through the authenticated API", async () => {
    mockBookmarkQueries([]);
    const { bridge, extensionOrigin, requestId } = await launchChromeImport();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "FAVLOCK_CHROME_BOOKMARKS_RESULT",
            requestId,
            tree: [
              {
                id: "0",
                title: "",
                children: [
                  {
                    id: "1",
                    title: "Imported Collection",
                    children: [
                      {
                        id: "2",
                        title: "Imported bookmark",
                        url: "https://example.test",
                      },
                    ],
                  },
                ],
              },
            ],
          },
          origin: extensionOrigin,
          source: bridge.contentWindow,
        }),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(mocks.createFolder).toHaveBeenCalledWith("current.jwt.token", {
      encryptedName: "Imported Collection",
      color: null,
      parentId: null,
      sortOrder: 0,
    });
    expect(document.body.textContent).toContain("1 collections created");
  });

  function mockBookmarkQueries(
    existingBookmarks: Array<{ id: string; title: string; url: string }>,
  ) {
    mocks.resourceUsage.bookmarks = existingBookmarks.length;
    mocks.getCachedBookmarksForUser.mockResolvedValue(
      existingBookmarks.map((bookmark) => ({
        ...bookmark,
        user_id: "user-1",
        created_at: "2026-08-20T09:00:00.000Z",
        folders: [],
        tags: [],
      })),
    );
  }

  async function launchChromeImport() {
    const extensionId = "c".repeat(32);
    const extensionOrigin = `chrome-extension://${extensionId}`;
    window.history.replaceState(
      {},
      "",
      `/settings?chromeExtensionId=${extensionId}&autoImport=chrome#import-bookmarks`,
    );

    await act(async () => {
      root.render(
        <BrowserRouter>
          <BrowserBookmarkImportSection />
        </BrowserRouter>,
      );
    });

    const bridge = container.querySelector("iframe")!;
    const postMessage = vi.spyOn(bridge.contentWindow!, "postMessage");
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "FAVLOCK_CHROME_EXTENSION_READY" },
          origin: extensionOrigin,
          source: bridge.contentWindow,
        }),
      );
    });
    const request = postMessage.mock.calls.find(
      ([message]) =>
        (message as { type?: string }).type ===
        "FAVLOCK_CHROME_BOOKMARKS_REQUEST",
    )?.[0] as { requestId: string };

    return { bridge, extensionOrigin, requestId: request.requestId };
  }

  async function sendChromeBookmarks(
    bridge: HTMLIFrameElement,
    extensionOrigin: string,
    requestId: string,
    bookmarks: Array<{ title: string; url: string }>,
  ) {
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "FAVLOCK_CHROME_BOOKMARKS_RESULT",
            requestId,
            tree: [{ id: "0", title: "", children: bookmarks }],
          },
          origin: extensionOrigin,
          source: bridge.contentWindow,
        }),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  async function clickDialogButton(label: string) {
    const button = [...document.body.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    expect(button).toBeDefined();
    await act(async () => {
      button!.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }
});
