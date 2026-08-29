import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decryptFieldStrict: vi.fn(),
  fetchBookmarks: vi.fn(),
  fetchEntries: vi.fn(),
  fetchFolders: vi.fn(),
  fetchTags: vi.fn(),
}));

vi.mock("./encryption", () => ({
  ENC_PREFIX: "enc:",
  decryptFieldStrict: mocks.decryptFieldStrict,
}));

vi.mock("./libraryContentApi", () => ({
  fetchEncryptedLibraryBookmarkSample: mocks.fetchBookmarks,
  fetchEncryptedLibraryEntrySample: mocks.fetchEntries,
  fetchEncryptedLibraryFolderSample: mocks.fetchFolders,
  fetchEncryptedLibraryTagSample: mocks.fetchTags,
}));

import {
  canDecryptExistingData,
  probeEncryptedData,
} from "./encryptionDataProbe";

const key = {} as CryptoKey;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchBookmarks.mockResolvedValue([]);
  mocks.fetchFolders.mockResolvedValue([]);
  mocks.fetchTags.mockResolvedValue([]);
  mocks.fetchEntries.mockResolvedValue([]);
  mocks.decryptFieldStrict.mockResolvedValue("decrypted");
});

describe("existing encrypted-data probe", () => {
  it("checks encrypted bookmarks first and avoids additional content reads", async () => {
    mocks.fetchBookmarks.mockResolvedValue([
      { encryptedTitle: "enc:bookmark", encryptedUrl: "enc:url" },
    ]);

    await expect(
      canDecryptExistingData(key, "current.jwt.token"),
    ).resolves.toBe(true);
    expect(mocks.fetchBookmarks).toHaveBeenCalledExactlyOnceWith(
      "current.jwt.token",
    );
    expect(mocks.decryptFieldStrict).toHaveBeenCalledWith("enc:bookmark", key);
    expect(mocks.fetchFolders).not.toHaveBeenCalled();
  });

  it("checks folder ciphertext through the API with the caller token", async () => {
    mocks.fetchFolders.mockResolvedValue([{ encryptedName: "enc:folder" }]);

    await expect(
      canDecryptExistingData(key, "current.jwt.token"),
    ).resolves.toBe(true);
    expect(mocks.fetchFolders).toHaveBeenCalledExactlyOnceWith(
      "current.jwt.token",
    );
    expect(mocks.decryptFieldStrict).toHaveBeenCalledWith("enc:folder", key);
    expect(mocks.fetchTags).not.toHaveBeenCalled();
  });

  it("fails closed when the first encrypted value does not decrypt", async () => {
    mocks.fetchFolders.mockResolvedValue([{ encryptedName: "enc:folder" }]);
    mocks.decryptFieldStrict.mockRejectedValue(new Error("wrong key"));

    await expect(
      canDecryptExistingData(key, "current.jwt.token"),
    ).resolves.toBe(false);
    expect(mocks.fetchTags).not.toHaveBeenCalled();
    expect(mocks.fetchEntries).not.toHaveBeenCalled();
  });

  it("distinguishes an empty library from a mismatched key", async () => {
    await expect(
      probeEncryptedData(key, "current.jwt.token"),
    ).resolves.toBe("empty");

    mocks.fetchBookmarks.mockResolvedValue([
      { encryptedTitle: "enc:bookmark", encryptedUrl: "enc:url" },
    ]);
    mocks.decryptFieldStrict.mockRejectedValue(new Error("wrong key"));
    await expect(
      probeEncryptedData(key, "current.jwt.token"),
    ).resolves.toBe("mismatch");
  });

  it("falls through plaintext taxonomy samples to encrypted entries", async () => {
    mocks.fetchFolders.mockResolvedValue([{ encryptedName: "plain folder" }]);
    mocks.fetchTags.mockResolvedValue([{ encryptedName: "plain tag" }]);
    mocks.fetchEntries.mockResolvedValue([
      {
        encryptedTitle: "enc:title",
        encryptedContent: "enc:content",
      },
    ]);

    await expect(
      canDecryptExistingData(key, "current.jwt.token"),
    ).resolves.toBe(true);
    expect(mocks.fetchEntries).toHaveBeenCalledExactlyOnceWith(
      "current.jwt.token",
    );
    expect(mocks.decryptFieldStrict).toHaveBeenCalledWith("enc:title", key);
  });

  it("propagates API failures instead of accepting an unverifiable key", async () => {
    mocks.fetchFolders.mockRejectedValue(new Error("API unavailable"));

    await expect(
      canDecryptExistingData(key, "current.jwt.token"),
    ).rejects.toThrow("API unavailable");
  });
});
