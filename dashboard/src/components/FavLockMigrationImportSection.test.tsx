import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FavLockMigrationImportSection from "./FavLockMigrationImportSection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const sourceKey = {} as CryptoKey;
const timestamp = "2026-08-25T09:00:00.000Z";
const archive = {
  format: "favlock-export" as const,
  version: 2 as const,
  exportedAt: timestamp,
  encrypted: false as const,
  selection: {
    bookmarks: true,
    notes: true,
    todos: true,
    readspace: true,
  },
  data: {
    collections: [],
    lists: [],
    tags: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        name: "Ideas",
        createdAt: timestamp,
      },
    ],
    bookmarks: [],
    notes: [],
    todos: [],
    readspace: [],
  },
};

const mocks = vi.hoisted(() => ({
  adoptMigratedKey: vi.fn(),
  clearBookmarkCacheForUser: vi.fn(),
  clearLibraryContentCacheForUser: vi.fn(),
  clearLocalSearchHistoryForUser: vi.fn(),
  decryptFavLockArchive: vi.fn(),
  importRawKey: vi.fn(),
  invalidateQueries: vi.fn(),
  migrateFavLockArchive: vi.fn(),
  parseEncryptedFavLockArchiveFile: vi.fn(),
  parseFavLockExport: vi.fn(),
  retryBookmarkCacheSync: vi.fn(),
  summarizeFavLockExport: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    session: { access_token: "current.jwt.token" },
    user: { id: "destination-user" },
    retryBookmarkCacheSync: mocks.retryBookmarkCacheSync,
  }),
}));
vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({
    adoptMigratedKey: mocks.adoptMigratedKey,
    keyLoading: false,
    keyRemembered: true,
  }),
}));
vi.mock("../hooks/useAccountPlanQuery", () => ({
  useAccountPlan: () => ({
    data: {
      id: "free",
      name: "Free",
      limits: {
        bookmarks: 1000,
        entries: 1000,
        readspace: 1000,
        highlights: 100,
        collections: 100,
        tags: 100,
        lists: 3,
      },
    },
    refetch: vi.fn(),
  }),
}));
vi.mock("../lib/bookmarkCache", () => ({
  clearBookmarkCacheForUser: mocks.clearBookmarkCacheForUser,
  clearLibraryContentCacheForUser: mocks.clearLibraryContentCacheForUser,
}));
vi.mock("../lib/encryptedArchive", () => ({
  ENCRYPTED_ARCHIVE_MAX_FILE_BYTES: 100 * 1024 * 1024,
  decryptFavLockArchive: mocks.decryptFavLockArchive,
  parseEncryptedFavLockArchiveFile: mocks.parseEncryptedFavLockArchiveFile,
}));
vi.mock("../lib/encryption", () => ({
  importRawKey: mocks.importRawKey,
}));
vi.mock("../lib/favLockExportValidation", () => ({
  parseFavLockExport: mocks.parseFavLockExport,
  summarizeFavLockExport: mocks.summarizeFavLockExport,
}));
vi.mock("../lib/libraryMigrationApi", () => ({
  migrateFavLockArchive: mocks.migrateFavLockArchive,
}));
vi.mock("../lib/searchHistory", () => ({
  clearLocalSearchHistoryForUser: mocks.clearLocalSearchHistoryForUser,
}));
vi.mock("../lib/userInfo", () => ({
  userInfoQueryKey: (userId: string) => ["user-info", userId],
}));

describe("FavLockMigrationImportSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.adoptMigratedKey.mockReset().mockResolvedValue(true);
    mocks.clearBookmarkCacheForUser.mockReset().mockResolvedValue(undefined);
    mocks.clearLibraryContentCacheForUser
      .mockReset()
      .mockResolvedValue(undefined);
    mocks.clearLocalSearchHistoryForUser.mockReset();
    mocks.decryptFavLockArchive.mockReset().mockResolvedValue(archive);
    mocks.importRawKey.mockReset().mockResolvedValue(sourceKey);
    mocks.invalidateQueries.mockReset().mockResolvedValue(undefined);
    mocks.migrateFavLockArchive.mockReset().mockResolvedValue(undefined);
    mocks.parseEncryptedFavLockArchiveFile.mockReset().mockReturnValue({});
    mocks.parseFavLockExport.mockReset().mockReturnValue(archive);
    mocks.retryBookmarkCacheSync.mockReset();
    mocks.summarizeFavLockExport.mockReset().mockReturnValue({
      collections: 0,
      lists: 0,
      tags: 1,
      bookmarks: 0,
      notes: 0,
      todos: 0,
      readspace: 0,
      highlights: 0,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("uses the original recovery key for the archive and destination account", async () => {
    await act(async () => {
      root.render(<FavLockMigrationImportSection />);
    });

    expect(container.textContent).toContain("Original recovery key");
    expect(container.textContent).not.toContain("Archive password");

    const fileInput = container.querySelector<HTMLInputElement>(
      "#favlock-migration-file",
    )!;
    const file = new File(["{}"], "account.favlock", {
      type: "application/vnd.favlock.encrypted+json",
    });
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [file],
    });
    const recoveryKeyInput = container.querySelector<HTMLInputElement>(
      "#favlock-migration-recovery-key",
    )!;
    const setInputValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;

    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      setInputValue.call(
        recoveryKeyInput,
        "ABCD 1234 EFGH 5678 IJKL 9012 MNOP 3456",
      );
      recoveryKeyInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const reviewButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Review archive"),
    )!;
    await act(async () => {
      reviewButton.click();
    });

    expect(mocks.importRawKey).toHaveBeenCalledWith(
      "ABCD 1234 EFGH 5678 IJKL 9012 MNOP 3456",
    );
    expect(mocks.decryptFavLockArchive).toHaveBeenCalledWith({}, sourceKey);

    const importButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Import into this account"),
    )!;
    await act(async () => {
      importButton.click();
    });

    expect(mocks.migrateFavLockArchive).toHaveBeenCalledWith(
      archive,
      "current.jwt.token",
      sourceKey,
      expect.any(Function),
    );
    expect(mocks.adoptMigratedKey).toHaveBeenCalledWith(sourceKey, {
      rememberDevice: true,
    });
    expect(mocks.clearBookmarkCacheForUser).toHaveBeenCalledWith(
      "destination-user",
    );
    expect(mocks.clearLibraryContentCacheForUser).toHaveBeenCalledWith(
      "destination-user",
    );
    expect(mocks.clearLocalSearchHistoryForUser).toHaveBeenCalledWith(
      "destination-user",
    );
    expect(container.textContent).toContain(
      "Your original recovery key now unlocks this account",
    );
  });

  it("does not silently drop Pro annotations when migrating to a Free account", async () => {
    mocks.parseFavLockExport.mockReturnValue({
      ...archive,
      version: 2,
      selection: { ...archive.selection, highlights: true },
      data: {
        ...archive.data,
        highlights: [{
          id: "30000000-0000-4000-8000-000000000001",
          bookmarkId: "40000000-0000-4000-8000-000000000001",
          payload: {
            version: 1,
            quote: { exact: "Quote", prefix: "", suffix: "" },
            position: null,
            dom: null,
            color: "yellow",
            note: "Private annotation",
            capturedAt: timestamp,
          },
          createdAt: timestamp,
          updatedAt: timestamp,
        }],
      },
    });
    await act(async () => root.render(<FavLockMigrationImportSection />));

    const fileInput = container.querySelector<HTMLInputElement>(
      "#favlock-migration-file",
    )!;
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [new File(["{}"], "account.favlock")],
    });
    const recoveryKeyInput = container.querySelector<HTMLInputElement>(
      "#favlock-migration-recovery-key",
    )!;
    const setInputValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      setInputValue.call(recoveryKeyInput, "ABCD1234EFGH5678IJKL9012MNOP3456");
      recoveryKeyInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const reviewButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Review archive"),
    )!;
    await act(async () => reviewButton.click());
    const importButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Import into this account"),
    )!;
    await act(async () => importButton.click());

    expect(container.textContent).toContain(
      "FavLock Pro is required to migrate them without losing annotations.",
    );
    expect(mocks.migrateFavLockArchive).not.toHaveBeenCalled();
  });

  it("blocks a Free migration containing more than 100 highlights", async () => {
    mocks.summarizeFavLockExport.mockReturnValue({
      collections: 0,
      lists: 0,
      tags: 0,
      bookmarks: 0,
      notes: 0,
      todos: 0,
      readspace: 0,
      highlights: 101,
    });
    await act(async () => root.render(<FavLockMigrationImportSection />));

    const fileInput = container.querySelector<HTMLInputElement>(
      "#favlock-migration-file",
    )!;
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [new File(["{}"], "account.favlock")],
    });
    const recoveryKeyInput = container.querySelector<HTMLInputElement>(
      "#favlock-migration-recovery-key",
    )!;
    const setInputValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      setInputValue.call(recoveryKeyInput, "ABCD1234EFGH5678IJKL9012MNOP3456");
      recoveryKeyInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const reviewButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Review archive"),
    )!;
    await act(async () => reviewButton.click());
    const importButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Import into this account"),
    )!;
    await act(async () => importButton.click());

    expect(container.textContent).toContain(
      "This archive has 101 highlights, but the Free plan allows 100.",
    );
    expect(mocks.migrateFavLockArchive).not.toHaveBeenCalled();
  });
});
