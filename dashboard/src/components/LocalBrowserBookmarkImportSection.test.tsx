import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LocalBrowserBookmarkImportSection from "./LocalBrowserBookmarkImportSection";

const {
  importBookmarks,
  parseFile,
  prepareImport,
  readBookmarks,
  readFolders,
  retrySync,
} = vi.hoisted(() => ({
  importBookmarks: vi.fn(),
  parseFile: vi.fn(),
  prepareImport: vi.fn(),
  readBookmarks: vi.fn(),
  readFolders: vi.fn(),
  retrySync: vi.fn(),
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    user: { id: "local-user" },
    isLocalAccount: true,
    retryBookmarkCacheSync: retrySync,
  }),
}));

vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({
    cryptoKey: {},
    keyLoading: false,
    triggerUnlock: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("../lib/browserBookmarkImport", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/browserBookmarkImport")>();
  return { ...original, parseBrowserBookmarksFile: parseFile };
});

vi.mock("../lib/browserBookmarkImportPlan", () => ({
  prepareBrowserBookmarkImport: prepareImport,
}));

vi.mock("../lib/localVault", () => ({
  importLocalBookmarks: importBookmarks,
  readLocalBookmarks: readBookmarks,
  readLocalFolders: readFolders,
}));

vi.mock("../lib/onboarding", () => ({ setLibraryPopulated: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const source = {
  bookmarks: [{ title: "New", url: "https://new.test", folderPath: ["Work"] }],
  folderPaths: [["Work"]],
};

function preview(overrides: Record<string, unknown> = {}) {
  return {
    fingerprint: "a".repeat(64),
    items: [
      {
        index: 0,
        title: "New",
        url: "https://new.test/",
        folderPath: ["Work"],
        duplicate: null,
        existingBookmark: null,
      },
    ],
    invalidItems: [],
    folderPaths: [["Work"]],
    newFolderPaths: [["Work"]],
    totalCount: 1,
    validCount: 1,
    invalidCount: 0,
    duplicateCount: 0,
    sourceDuplicateCount: 0,
    libraryDuplicateCount: 0,
    readyToAddCount: 1,
    bookmarkLimit: 250,
    bookmarkUsage: 0,
    availableBookmarks: 250,
    collectionLimit: 0,
    collectionUsage: 0,
    availableCollections: null,
    blockedReason: null,
    ...overrides,
  };
}

function findButton(label: string) {
  return Array.from(document.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(label),
  );
}

describe("LocalBrowserBookmarkImportSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    parseFile.mockResolvedValue(source);
    readBookmarks.mockResolvedValue([]);
    readFolders.mockResolvedValue([]);
    prepareImport.mockResolvedValue(preview());
    importBookmarks.mockResolvedValue({
      added: 1,
      overwritten: 0,
      collectionsCreated: 1,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function chooseFile() {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["synthetic"], "bookmarks.html", { type: "text/html" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  }

  it("previews and atomically imports new bookmarks without a cloud session", async () => {
    await act(async () => root.render(<LocalBrowserBookmarkImportSection />));
    await chooseFile();

    expect(document.body.textContent).toContain("Import preview");
    expect(document.body.textContent).toContain("250 spaces available");
    await act(async () => findButton("Import bookmarks")?.click());

    expect(importBookmarks).toHaveBeenCalledWith(
      "local-user",
      [{ title: "New", url: "https://new.test/", folderPath: ["Work"] }],
      {},
    );
    expect(document.body.textContent).toContain(
      "1 added, 0 overwritten, 0 skipped. 1 Collection created.",
    );
    expect(retrySync).toHaveBeenCalledOnce();
  });

  it("reviews a library duplicate and preserves its identity when overwriting", async () => {
    const existing = {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "local-user",
      title: "Existing",
      url: "https://new.test/",
      created_at: "2026-09-02T10:00:00.000Z",
      folders: [],
      tags: [],
    };
    prepareImport.mockResolvedValue(
      preview({
        items: [
          {
            index: 0,
            title: "Imported title",
            url: "https://new.test/",
            folderPath: ["Work"],
            duplicate: "library",
            existingBookmark: existing,
          },
        ],
        duplicateCount: 1,
        libraryDuplicateCount: 1,
        readyToAddCount: 0,
      }),
    );
    importBookmarks.mockResolvedValue({
      added: 0,
      overwritten: 1,
      collectionsCreated: 1,
    });

    await act(async () => root.render(<LocalBrowserBookmarkImportSection />));
    await chooseFile();
    await act(async () => findButton("Review duplicates and import")?.click());
    expect(document.body.textContent).toContain("Review duplicate bookmark");
    await act(async () => findButton("Overwrite")?.click());

    expect(importBookmarks).toHaveBeenCalledWith(
      "local-user",
      [
        {
          title: "Imported title",
          url: "https://new.test/",
          folderPath: ["Work"],
          overwriteBookmarkId: existing.id,
        },
      ],
      {},
    );
  });

  it("shows a limit failure without exposing an import action", async () => {
    prepareImport.mockResolvedValue(
      preview({
        availableBookmarks: 0,
        blockedReason: "This import needs space for 1 new bookmark.",
      }),
    );
    await act(async () => root.render(<LocalBrowserBookmarkImportSection />));
    await chooseFile();

    expect(document.body.textContent).toContain(
      "This import needs space for 1 new bookmark.",
    );
    expect(findButton("Import bookmarks")).toBeUndefined();
  });
});
