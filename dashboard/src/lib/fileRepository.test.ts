import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptFile } from "./fileEncryption";
import { deleteEncryptedFile, reserveEncryptedFile, uploadEncryptedFile } from "./filesApi";
import { uploadFile } from "./fileRepository";

vi.mock("./fileEncryption", () => ({ encryptFile: vi.fn() }));
vi.mock("./filesApi", () => ({
  deleteEncryptedFile: vi.fn(), reserveEncryptedFile: vi.fn(), uploadEncryptedFile: vi.fn(),
}));
const key = {} as CryptoKey;
const file = new File(["%PDF-1.7"], "test.pdf");

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(encryptFile).mockResolvedValue({
    fileId: "unused", ciphertext: new Blob(["opaque"]),
    encryptedMetadata: "enc:metadata", wrappedKey: "fwk:2:key", formatVersion: 2,
  });
  vi.mocked(reserveEncryptedFile).mockResolvedValue();
  vi.mocked(uploadEncryptedFile).mockResolvedValue();
  vi.mocked(deleteEncryptedFile).mockResolvedValue();
});

describe("encrypted file upload lifecycle", () => {
  it("binds encryption to the ID used by reservation and upload", async () => {
    const id = await uploadFile(file, key, "fake-token");
    expect(encryptFile).toHaveBeenCalledWith(file, key, id, undefined);
    expect(reserveEncryptedFile).toHaveBeenCalledWith("fake-token", expect.objectContaining({ fileId: id }));
    expect(uploadEncryptedFile).toHaveBeenCalledWith("fake-token", id, expect.any(Blob), undefined);
  });

  it("attempts cleanup when a committed reservation's response is lost", async () => {
    vi.mocked(reserveEncryptedFile).mockRejectedValue(new Error("lost response"));
    await expect(uploadFile(file, key, "fake-token")).rejects.toThrow("lost response");
    const id = vi.mocked(reserveEncryptedFile).mock.calls[0]![1].fileId;
    expect(deleteEncryptedFile).toHaveBeenCalledWith("fake-token", id);
    expect(uploadEncryptedFile).not.toHaveBeenCalled();
  });

  it("does not hide the upload error if offline cleanup also fails", async () => {
    vi.mocked(uploadEncryptedFile).mockRejectedValue(new Error("upload failed"));
    vi.mocked(deleteEncryptedFile).mockRejectedValue(new Error("offline"));
    await expect(uploadFile(file, key, "fake-token")).rejects.toThrow("upload failed");
  });

  it("cleans up when the vault locks while reservation is pending", async () => {
    const controller = new AbortController();
    vi.mocked(reserveEncryptedFile).mockImplementation(async () => { controller.abort(); });
    await expect(uploadFile(file, key, "fake-token", undefined, controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(uploadEncryptedFile).not.toHaveBeenCalled();
    expect(deleteEncryptedFile).toHaveBeenCalledOnce();
  });
});
