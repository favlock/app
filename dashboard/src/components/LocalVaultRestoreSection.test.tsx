import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FavLockExport } from "../lib/dataExport";
import LocalVaultRestoreSection from "./LocalVaultRestoreSection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const {
  backupKey,
  currentKey,
  decryptFavLockArchive,
  hasLocalVaultContent,
  importRawKey,
  invalidateQueries,
  parseEncryptedFavLockArchiveFile,
  parseFavLockExport,
  restoreLocalVaultFromExport,
  retryBookmarkCacheSync,
  setLibraryPopulated,
  summarizeFavLockExport,
} = vi.hoisted(() => ({
  backupKey: {} as CryptoKey,
  currentKey: {} as CryptoKey,
  decryptFavLockArchive: vi.fn(),
  hasLocalVaultContent: vi.fn(),
  importRawKey: vi.fn(),
  invalidateQueries: vi.fn(),
  parseEncryptedFavLockArchiveFile: vi.fn(),
  parseFavLockExport: vi.fn(),
  restoreLocalVaultFromExport: vi.fn(),
  retryBookmarkCacheSync: vi.fn(),
  setLibraryPopulated: vi.fn(),
  summarizeFavLockExport: vi.fn(),
}));

const archive: FavLockExport = {
  format: "favlock-export",
  version: 2,
  exportedAt: "2026-09-03T08:00:00.000Z",
  encrypted: false,
  selection: { bookmarks: true, notes: true, todos: true, readspace: true },
  data: {
    collections: [],
    tags: [],
    lists: [],
    bookmarks: [{
      id: "bookmark-1",
      title: "Restored bookmark",
      url: "https://example.com",
      collectionIds: [],
      tagIds: [],
      isFavorite: false,
      favoritedAt: null,
      createdAt: "2026-09-03T08:00:00.000Z",
    }],
    notes: [],
    todos: [],
    readspace: [],
  },
};

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    user: { id: "local-user" },
    isLocalAccount: true,
    retryBookmarkCacheSync,
  }),
}));

vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({ cryptoKey: currentKey }),
}));

vi.mock("../lib/encryptedArchive", () => ({
  decryptFavLockArchive,
  ENCRYPTED_ARCHIVE_MAX_FILE_BYTES: 10_000_000,
  parseEncryptedFavLockArchiveFile,
}));

vi.mock("../lib/encryption", () => ({ importRawKey }));

vi.mock("../lib/favLockExportValidation", () => ({
  parseFavLockExport,
  summarizeFavLockExport,
}));

vi.mock("../lib/localVault", () => ({
  hasLocalVaultContent,
  LOCAL_BOOKMARK_LIMIT: 250,
  LOCAL_ENTRY_LIMIT: 25,
  LOCAL_LIST_LIMIT: 3,
  restoreLocalVaultFromExport,
}));

vi.mock("../lib/onboarding", () => ({ setLibraryPopulated }));

describe("LocalVaultRestoreSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    decryptFavLockArchive.mockReset().mockResolvedValue("{}");
    hasLocalVaultContent.mockReset().mockResolvedValue(false);
    importRawKey.mockReset().mockResolvedValue(backupKey);
    invalidateQueries.mockReset().mockResolvedValue(undefined);
    parseEncryptedFavLockArchiveFile.mockReset().mockReturnValue({});
    parseFavLockExport.mockReset().mockReturnValue(archive);
    restoreLocalVaultFromExport.mockReset().mockResolvedValue(undefined);
    retryBookmarkCacheSync.mockReset();
    setLibraryPopulated.mockReset();
    summarizeFavLockExport.mockReset().mockReturnValue({
      bookmarks: 1,
      collections: 0,
      tags: 0,
      lists: 0,
      notes: 0,
      todos: 0,
      readspace: 0,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<LocalVaultRestoreSection />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("decrypts with the backup key but restores under the existing local key", async () => {
    const file = new File(["encrypted"], "backup.favlock", {
      type: "application/vnd.favlock.encrypted+json",
    });
    Object.defineProperty(file, "text", {
      value: vi.fn().mockResolvedValue("encrypted"),
    });
    const fileInput = container.querySelector(
      '#local-vault-backup-file',
    ) as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [file] });
    await act(async () => fileInput.dispatchEvent(new Event("change", { bubbles: true })));

    const keyInput = container.querySelector(
      '#local-vault-recovery-key',
    ) as HTMLInputElement;
    const setInputValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setInputValue.call(keyInput, "backup-recovery-key");
      keyInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const reviewButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Review backup"));
    await act(async () => reviewButton!.click());
    await vi.waitFor(() => expect(parseFavLockExport).toHaveBeenCalledOnce());

    const restoreButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Restore into this vault"));
    await act(async () => restoreButton!.click());
    await vi.waitFor(() => expect(restoreLocalVaultFromExport).toHaveBeenCalledOnce());

    expect(importRawKey).toHaveBeenCalledWith("backup-recovery-key");
    expect(decryptFavLockArchive).toHaveBeenCalledWith({}, backupKey);
    expect(restoreLocalVaultFromExport).toHaveBeenCalledWith(
      "local-user",
      archive,
      currentKey,
    );
    expect(document.body.textContent).toContain(
      "Your existing local key and passkey still protect this vault.",
    );
  });
});
