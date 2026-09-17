import { describe, expect, it } from "vitest";
import { importRawKey, encryptField } from "./encryption";
import {
  FILE_CHUNK_SIZE,
  PRO_FILE_MAX_BYTES,
  decryptFile,
  decryptFileMetadata,
  encryptFile,
  isValidEncryptedFileCiphertextSize,
} from "./fileEncryption";

const MASTER_KEY = "12345678901234567890123456789012";
const WRONG_KEY = "abcdefghijklmnopqrstuvwxyzabcdef";

function pdfFile(name: string, size: number): File {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("%PDF-1.7\n"));
  for (let index = 9; index < bytes.length; index += 1) bytes[index] = index % 251;
  return new File([bytes], name, {
    type: "application/pdf",
    lastModified: 1_788_806_400_000,
  });
}

describe("encrypted file format", () => {
  it("accepts at most the 100 MiB Pro ciphertext shape", () => {
    const maxChunks = PRO_FILE_MAX_BYTES / FILE_CHUNK_SIZE;
    const maxCiphertextBytes = 25 + maxChunks * (FILE_CHUNK_SIZE + 16);
    expect(PRO_FILE_MAX_BYTES).toBe(100 * 1024 * 1024);
    expect(isValidEncryptedFileCiphertextSize(maxCiphertextBytes)).toBe(true);
    expect(isValidEncryptedFileCiphertextSize(maxCiphertextBytes + FILE_CHUNK_SIZE + 16)).toBe(false);
  });

  it("round-trips a multi-chunk file and protects its metadata", async () => {
    const key = await importRawKey(MASTER_KEY);
    const source = pdfFile("private-contract.pdf", FILE_CHUNK_SIZE + 37);

    const encrypted = await encryptFile(source, key);
    expect(encrypted.encryptedMetadata).toMatch(/^enc:/);
    expect(encrypted.encryptedMetadata).not.toContain("private-contract.pdf");
    expect(encrypted.wrappedKey).toMatch(/^fwk:2:/);
    expect(encrypted.ciphertext.type).toBe("application/octet-stream");

    const metadata = await decryptFileMetadata(encrypted.encryptedMetadata, key, encrypted.fileId);
    expect(metadata).toEqual({
      fileId: encrypted.fileId,
      name: "private-contract.pdf",
      mimeType: "application/pdf",
      size: source.size,
      lastModified: source.lastModified,
    });

    const decrypted = await decryptFile(
      encrypted.ciphertext,
      encrypted.encryptedMetadata,
      encrypted.wrappedKey,
      key,
      encrypted.fileId,
    );
    expect(decrypted.metadata).toEqual(metadata);
    expect(new Uint8Array(await decrypted.blob.arrayBuffer())).toEqual(
      new Uint8Array(await source.arrayBuffer()),
    );
  });

  it("pads files in the same chunk range to the same ciphertext size", async () => {
    const key = await importRawKey(MASTER_KEY);
    const small = await encryptFile(pdfFile("small.pdf", 100), key);
    const larger = await encryptFile(pdfFile("larger.pdf", 10_000), key);
    expect(small.ciphertext.size).toBe(larger.ciphertext.size);
  });

  it("rejects tampered ciphertext and the wrong vault key", async () => {
    const key = await importRawKey(MASTER_KEY);
    const wrongKey = await importRawKey(WRONG_KEY);
    const encrypted = await encryptFile(pdfFile("private.pdf", 128), key);
    const bytes = new Uint8Array(await encrypted.ciphertext.arrayBuffer());
    bytes[bytes.length - 1] ^= 1;

    await expect(decryptFile(
      new Blob([bytes], { type: "application/octet-stream" }),
      encrypted.encryptedMetadata,
      encrypted.wrappedKey,
      key,
      encrypted.fileId,
    )).rejects.toThrow();
    await expect(decryptFileMetadata(encrypted.encryptedMetadata, wrongKey, encrypted.fileId)).rejects.toThrow();
  });

  it("rejects a file whose content is not an allowed PDF or image", async () => {
    const key = await importRawKey(MASTER_KEY);
    const fake = new File(["plain text"], "fake.pdf", { type: "application/pdf" });
    await expect(encryptFile(fake, key)).rejects.toThrow(
      "Choose a PDF, JPEG, PNG, WebP, or GIF file.",
    );
  });

  it("rejects substituted metadata, swapped file keys, and another record identity", async () => {
    const key = await importRawKey(MASTER_KEY);
    const first = await encryptFile(pdfFile("first.pdf", 1009), key);
    const second = await encryptFile(pdfFile("second.pdf", 19), key);
    await expect(decryptFileMetadata(second.encryptedMetadata, key, first.fileId)).rejects.toThrow();
    await expect(decryptFile(first.ciphertext, second.encryptedMetadata, first.wrappedKey, key, first.fileId)).rejects.toThrow();
    // Even re-encrypted metadata with the correct identity cannot change the
    // authenticated length/name of an existing object.
    const metadata = await decryptFileMetadata(first.encryptedMetadata, key, first.fileId);
    const changed = await encryptField(JSON.stringify({ ...metadata, size: 19 }), key);
    await expect(decryptFile(first.ciphertext, changed, first.wrappedKey, key, first.fileId)).rejects.toThrow();
    await expect(decryptFile(first.ciphertext, first.encryptedMetadata, second.wrappedKey, key, first.fileId)).rejects.toThrow();
    await expect(decryptFile(first.ciphertext, first.encryptedMetadata, first.wrappedKey, key, second.fileId)).rejects.toThrow();
  });

  it("honors cancellation before encryption and after a download", async () => {
    const key = await importRawKey(MASTER_KEY);
    const controller = new AbortController(); controller.abort();
    await expect(encryptFile(pdfFile("cancel.pdf", 100), key, crypto.randomUUID(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    const encrypted = await encryptFile(pdfFile("cancel.pdf", 100), key);
    await expect(decryptFile(encrypted.ciphertext, encrypted.encryptedMetadata, encrypted.wrappedKey, key, encrypted.fileId, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects the old unbound header and key-envelope versions", async () => {
    const key = await importRawKey(MASTER_KEY);
    const encrypted = await encryptFile(pdfFile("bound.pdf", 128), key);
    const bytes = new Uint8Array(await encrypted.ciphertext.arrayBuffer());
    bytes[8] = 1;
    await expect(decryptFile(
      new Blob([bytes]), encrypted.encryptedMetadata, encrypted.wrappedKey, key, encrypted.fileId,
    )).rejects.toThrow("format is not supported");
    await expect(decryptFile(
      encrypted.ciphertext, encrypted.encryptedMetadata,
      encrypted.wrappedKey.replace("fwk:2:", "fwk:1:"), key, encrypted.fileId,
    )).rejects.toThrow("key format is not supported");
  });
});
