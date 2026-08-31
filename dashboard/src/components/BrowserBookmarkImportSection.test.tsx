import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrowserBookmarkImportSection from "./BrowserBookmarkImportSection";
import { fingerprintBrowserBookmarkImport } from "../lib/browserBookmarkImportPlan";
import { createImportRecoveryJournal } from "../lib/importRecovery";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  cryptoKey: {},
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
  bookmarkLimit: 1000,
  authoritativeBookmarks: [] as Array<Record<string, unknown>>,
  authoritativeFolders: [] as Array<Record<string, unknown>>,
  loadAuthoritativeImportLibrary: vi.fn(),
  savedJournal: null as unknown,
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
    cryptoKey: mocks.cryptoKey,
    decryptField: mocks.decryptField,
    encryptField: mocks.encryptField,
    keyLoading: false,
  }),
}));
vi.mock("../lib/favLockAuth", () => ({
  favLockAuth: { getLocalUser: () => ({ id: "user-1" }) },
}));
vi.mock("../hooks/useFoldersQuery", () => ({
  useFolders: () => ({ data: [], isLoading: false }),
}));
vi.mock("../hooks/useAccountPlanQuery", () => ({
  useAccountPlan: () => ({
    data: {
      limits: { bookmarks: mocks.bookmarkLimit, collections: 100 },
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
vi.mock("../lib/browserBookmarkImportReconciliation", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/browserBookmarkImportReconciliation")
  >("../lib/browserBookmarkImportReconciliation");
  return {
    ...actual,
    loadAuthoritativeImportLibrary: mocks.loadAuthoritativeImportLibrary,
  };
});
vi.mock("../lib/importRecovery", async () => {
  const actual = await vi.importActual<typeof import("../lib/importRecovery")>(
    "../lib/importRecovery",
  );
  return {
    ...actual,
    saveImportRecoveryJournal: vi.fn(async (journal) => {
      mocks.savedJournal = journal;
    }),
    readImportRecoveryJournal: vi.fn(async () => mocks.savedJournal),
    clearImportRecoveryJournal: vi.fn(() => {
      mocks.savedJournal = null;
    }),
  };
});
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
    mocks.refetchAccountPlan.mockImplementation(async () => ({
      data: { limits: { bookmarks: mocks.bookmarkLimit, collections: 100 } },
    }));
    mocks.refetchResourceUsage.mockReset();
    mocks.refetchResourceUsage.mockImplementation(async () => ({
      data: { ...mocks.resourceUsage },
    }));
    mocks.retryBookmarkCacheSync.mockReset();
    mocks.resourceUsage.bookmarks = 0;
    mocks.resourceUsage.collections = 0;
    mocks.bookmarkLimit = 1000;
    mocks.authoritativeBookmarks = [];
    mocks.authoritativeFolders = [];
    mocks.savedJournal = null;
    mocks.loadAuthoritativeImportLibrary.mockReset().mockImplementation(
      async () => ({
        bookmarks: mocks.authoritativeBookmarks,
        folders: mocks.authoritativeFolders,
      }),
    );
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

  it("allows Pro imports when the bookmark allowance is unlimited", async () => {
    mocks.bookmarkLimit = 0;
    mocks.resourceUsage.bookmarks = 50_000;
    const { bridge, extensionOrigin, requestId } = await launchChromeImport();

    await sendChromeBookmarks(bridge, extensionOrigin, requestId, [
      { title: "New bookmark", url: "https://new.test" },
    ]);

    expect(document.body.textContent).toContain("Unlimited bookmark capacity");
    expect(document.body.textContent).toContain(
      "Your plan has no bookmark-count limit.",
    );
    await clickButton("Start import");
    await waitForImportWork();

    expect(mocks.createBookmark).toHaveBeenCalledTimes(1);
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

    expect(document.body.textContent).toContain("Import preview");
    await clickButton("Review duplicates and import");

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
      "0 added, 2 duplicates, 0 failed, 0 remaining",
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
    await clickButton("Review duplicates and import");
    expect(mocks.overwriteBookmarkImportContent).not.toHaveBeenCalled();

    await clickDialogButton("Overwrite");

    expect(mocks.overwriteBookmarkImportContent).toHaveBeenCalledWith(
      "current.jwt.token",
      "existing-1",
      "Imported title",
      "https://example.test/",
    );
    expect(mocks.moveBookmarkToFolder).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "0 added, 1 overwritten, 0 duplicates, 0 failed, 0 remaining",
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
    await clickButton("Review duplicates and import");
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
      "1 added, 0 duplicates, 0 failed, 0 remaining",
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
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });

    await clickButton("Start import");
    await waitForImportWork();

    expect(mocks.createFolder).toHaveBeenCalledWith("current.jwt.token", {
      encryptedName: "Imported Collection",
      color: null,
      parentId: null,
      sortOrder: 0,
    });
    expect(document.body.textContent).toContain("New collections1");
  });

  it("blocks an over-limit import at preview without truncating or writing", async () => {
    mocks.resourceUsage.bookmarks = 999;
    const { bridge, extensionOrigin, requestId } = await launchChromeImport();

    await sendChromeBookmarks(bridge, extensionOrigin, requestId, [
      { title: "One", url: "https://one.test" },
      { title: "Two", url: "https://two.test" },
    ]);

    expect(document.body.textContent).toContain(
      "needs space for at least 2 new bookmarks, but your current plan has 1 remaining",
    );
    expect(document.body.textContent).toContain("Nothing is written until you continue");
    expect(mocks.createBookmark).not.toHaveBeenCalled();
  });

  it("continues after a definite item failure and reports the partial result", async () => {
    mocks.createBookmark
      .mockResolvedValueOnce("22222222-2222-4222-8222-222222222222")
      .mockRejectedValueOnce(new Error("definite failure"));
    const { bridge, extensionOrigin, requestId } = await launchChromeImport();
    await sendChromeBookmarks(bridge, extensionOrigin, requestId, [
      { title: "One", url: "https://one.test" },
      { title: "Two", url: "https://two.test" },
    ]);

    await clickButton("Start import");
    await waitForImportWork();

    expect(mocks.createBookmark).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain(
      "1 added, 0 duplicates, 1 failed, 0 remaining",
    );
    expect(document.body.textContent).toContain("Retry failed records");
    expect(document.body.textContent).toContain("Failed records (1)");
    expect(document.body.textContent).toContain("Two");
    expect(document.body.textContent).toContain("https://two.test/");
    expect(document.body.textContent).toContain(
      "FavLock could not confirm this bookmark was saved. It is safe to retry.",
    );
  });

  it("separates invalid source values from retryable write failures", async () => {
    const { bridge, extensionOrigin, requestId } = await launchChromeImport();
    await sendChromeBookmarks(bridge, extensionOrigin, requestId, [
      { title: "Valid", url: "https://valid.test" },
      { title: "Unsafe", url: "javascript:alert(1)" },
    ]);

    expect(document.body.textContent).toContain("Invalid / unsupported records (1)");
    expect(document.body.textContent).toContain("Unsafe");
    expect(document.body.textContent).toContain("javascript:alert(1)");
    expect(document.body.textContent).toContain("Unsupported or invalid URL");

    await clickButton("Start import");
    await waitForImportWork();

    expect(document.body.textContent).toContain(
      "1 added, 0 duplicates, 1 invalid, 0 failed, 0 remaining",
    );
    expect(document.body.textContent).not.toContain("Retry failed records");
  });

  it("reconciles a timeout after a possible commit before replaying", async () => {
    const committed = {
      id: "55555555-5555-4555-8555-555555555555",
      user_id: "user-1",
      title: "Committed",
      url: "https://committed.test/",
      created_at: "2026-08-29T10:00:00.000Z",
      folders: [],
      tags: [],
    };
    mocks.createBookmark.mockRejectedValueOnce(new Error("timeout"));
    mocks.loadAuthoritativeImportLibrary
      .mockReset()
      .mockResolvedValueOnce({ bookmarks: [], folders: [] })
      .mockResolvedValueOnce({ bookmarks: [], folders: [] })
      .mockResolvedValueOnce({ bookmarks: [committed], folders: [] });
    const { bridge, extensionOrigin, requestId } = await launchChromeImport();
    await sendChromeBookmarks(bridge, extensionOrigin, requestId, [
      { title: "Committed", url: "https://committed.test" },
    ]);

    await clickButton("Start import");
    await waitForImportWork();

    expect(mocks.createBookmark).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain(
      "1 added, 0 duplicates, 0 failed, 0 remaining",
    );
  });

  it("shows uncertain record values separately from definite failures", async () => {
    mocks.createBookmark.mockRejectedValueOnce(new Error("network interrupted"));
    mocks.loadAuthoritativeImportLibrary
      .mockReset()
      .mockResolvedValueOnce({ bookmarks: [], folders: [] })
      .mockResolvedValueOnce({ bookmarks: [], folders: [] })
      .mockRejectedValueOnce(new Error("still offline"));
    const { bridge, extensionOrigin, requestId } = await launchChromeImport();
    await sendChromeBookmarks(bridge, extensionOrigin, requestId, [
      { title: "Uncertain bookmark", url: "https://uncertain.test" },
    ]);

    await clickButton("Start import");
    await waitForImportWork();

    expect(document.body.textContent).toContain("Unknown outcomes (1)");
    expect(document.body.textContent).toContain("Uncertain bookmark");
    expect(document.body.textContent).toContain("https://uncertain.test/");
    expect(document.body.textContent).toContain(
      "The write may have completed. FavLock will reconcile it before retrying.",
    );
    expect(document.body.textContent).not.toContain("Retry failed records");
  });

  it("stops after the current bounded batch and keeps the remaining count", async () => {
    let releaseWrites!: () => void;
    const writesReleased = new Promise<void>((resolve) => {
      releaseWrites = resolve;
    });
    mocks.createBookmark.mockImplementation(async () => {
      await writesReleased;
      return "22222222-2222-4222-8222-222222222222";
    });
    const { bridge, extensionOrigin, requestId } = await launchChromeImport();
    await sendChromeBookmarks(
      bridge,
      extensionOrigin,
      requestId,
      Array.from({ length: 5 }, (_, index) => ({
        title: `Bookmark ${index}`,
        url: `https://cancel.test/${index}`,
      })),
    );

    await clickButton("Start import");
    expect(mocks.createBookmark).toHaveBeenCalledTimes(4);
    await clickButton("Stop after current batch");
    releaseWrites();
    await waitForImportWork();

    expect(mocks.createBookmark).toHaveBeenCalledTimes(4);
    expect(document.body.textContent).toContain(
      "Import canceled: 4 added, 0 duplicates, 0 failed, 1 remaining",
    );
  });

  it("verifies a reselected source and reconciles an interrupted committed write", async () => {
    const result = {
      bookmarks: [
        { title: "Recovered", url: "https://recovered.test", folderPath: [] },
      ],
      folderPaths: [],
    };
    const journal = createImportRecoveryJournal(
      "user-1",
      await fingerprintBrowserBookmarkImport(result),
      "chrome",
      1,
    );
    journal.inFlight = [{ kind: "create", index: 0, existingIds: [] }];
    mocks.savedJournal = journal;
    const committed = {
      id: "66666666-6666-4666-8666-666666666666",
      user_id: "user-1",
      title: "Recovered",
      url: "https://recovered.test/",
      created_at: "2026-08-29T10:00:00.000Z",
      folders: [],
      tags: [],
    };
    mocks.authoritativeBookmarks = [committed];
    const { bridge, extensionOrigin, requestId } = await launchChromeImport();
    await sendChromeBookmarks(bridge, extensionOrigin, requestId, [
      { title: "Recovered", url: "https://recovered.test" },
    ]);

    await clickButton("Reconcile and resume");
    await waitForImportWork();

    expect(mocks.createBookmark).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "1 added, 0 duplicates, 0 failed, 0 remaining",
    );
  });

  function mockBookmarkQueries(
    existingBookmarks: Array<{ id: string; title: string; url: string }>,
  ) {
    mocks.resourceUsage.bookmarks = existingBookmarks.length;
    const rows = existingBookmarks.map((bookmark) => ({
        ...bookmark,
        user_id: "user-1",
        created_at: "2026-08-20T09:00:00.000Z",
        folders: [],
        tags: [],
      }));
    mocks.getCachedBookmarksForUser.mockResolvedValue(rows);
    mocks.authoritativeBookmarks = rows;
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
      await new Promise((resolve) => window.setTimeout(resolve, 20));
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

  async function clickButton(label: string) {
    const button = [...document.body.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    expect(button).toBeDefined();
    await act(async () => {
      button!.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  async function waitForImportWork() {
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });
  }
});
