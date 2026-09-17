import { beforeEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { importRawKey } from "./encryption";
import { encryptFile, FILE_CHUNK_SIZE } from "./fileEncryption";
import { downloadEncryptedFile, fetchEncryptedFiles, type EncryptedFileRecord } from "./filesApi";
import { buildFileExportPart, FILE_EXPORT_PART_BYTES, loadFileExportPlan, planFileExport } from "./fileExport";

vi.mock("./filesApi", () => ({ downloadEncryptedFile: vi.fn(), fetchEncryptedFiles: vi.fn() }));
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secondId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function record(fileId = id, chunks = 1): EncryptedFileRecord {
  return { id: fileId, encryptedMetadata: "enc:metadata", wrappedKey: "fwk:2:key",
    ciphertextBytes: 25 + chunks * (FILE_CHUNK_SIZE + 16), formatVersion: 2,
    createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-10T00:00:00Z" };
}

describe("portable Files export", () => {
  beforeEach(() => vi.resetAllMocks());

  it("plans the maximum file size in separate bounded parts without allocating content", () => {
    const files = Array.from({ length: 50 }, (_, index) => record(
      `aaaaaaaa-aaaa-4aaa-8aaa-${index.toString().padStart(12, "0")}`, 100,
    ));
    const plan = planFileExport(files, 2);
    expect(plan.fileCount).toBe(50);
    expect(plan.pendingCount).toBe(2);
    expect(plan.parts).toHaveLength(50);
    expect(plan.parts.every((part) => part.reduce((sum, file) => sum + file.ciphertextBytes, 0) <= FILE_EXPORT_PART_BYTES)).toBe(true);
    expect(plan.parts.flat().map((file) => file.id)).toEqual(files.map((file) => file.id));
  });

  it("bounds part entry counts and sorts a snapshot without mutating the source", () => {
    const files = Array.from({ length: 101 }, (_, index) => record(
      `aaaaaaaa-aaaa-4aaa-8aaa-${(101 - index).toString().padStart(12, "0")}`,
    ));
    const originalIds = files.map((file) => file.id);
    const plan = planFileExport(files, 0);
    expect(plan.parts.map((part) => part.length)).toEqual([100, 1]);
    expect(files.map((file) => file.id)).toEqual(originalIds);
    expect(plan.parts.flat().map((file) => file.id)).toEqual([...originalIds].sort());
  });

  it("rejects duplicate identities, invalid sizes, and unsafe file IDs", () => {
    expect(() => planFileExport([record(), record()], 0)).toThrow();
    expect(() => planFileExport([record(), record(id.toUpperCase())], 0)).toThrow();
    expect(() => planFileExport([record("../../escape")], 0)).toThrow();
    expect(() => planFileExport([record(id, 101)], 0)).toThrow();
  });

  it("includes only ready files and records the excluded unfinished-upload count", async () => {
    const signal = new AbortController().signal;
    vi.mocked(fetchEncryptedFiles).mockResolvedValue({ files: [record()], pendingFiles: [
      { id: secondId, ciphertextBytes: 1048617, createdAt: "2026-09-10T00:00:00Z" },
    ], usage: { usedBytes: 2097234, limitBytes: 52428800, maxCiphertextBytes: 10485945 } });
    expect(await loadFileExportPlan("test-token", signal)).toMatchObject({ fileCount: 1, pendingCount: 1, parts: [[record()]] });
    expect(fetchEncryptedFiles).toHaveBeenCalledWith("test-token", signal);
  });

  it("round-trips original bytes, keeps duplicate filenames distinct, and exports a manifest", async () => {
    const key = await importRawKey("12345678901234567890123456789012");
    const contents = ["%PDF-1.7\nfirst file", "%PDF-1.7\nsecond file"];
    const encrypted = await Promise.all([id, secondId].map((fileId, index) => encryptFile(
      new File([contents[index]], "CON.pdf", { type: "application/pdf", lastModified: 1788806400000 }), key, fileId,
    )));
    const files = encrypted.map((file) => ({ ...record(file.fileId), encryptedMetadata: file.encryptedMetadata, wrappedKey: file.wrappedKey }));
    vi.mocked(downloadEncryptedFile).mockImplementation(async (_token, fileId) => encrypted.find((file) => file.fileId === fileId)!.ciphertext);
    const progress = vi.fn();
    const plan = planFileExport(files, 1);
    const blob = await buildFileExportPart(plan, 0, key, "test-token", new AbortController().signal, progress);
    const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(blob.type).toBe("application/zip");
    expect(Object.keys(zip)).toEqual([`files/${id}/_CON.pdf`, `files/${secondId}/_CON.pdf`, "manifest.json"]);
    expect(strFromU8(zip[`files/${id}/_CON.pdf`])).toBe(contents[0]);
    expect(strFromU8(zip[`files/${secondId}/_CON.pdf`])).toBe(contents[1]);
    expect(JSON.parse(strFromU8(zip["manifest.json"]))).toMatchObject({
      format: "favlock-files-export", version: 1, part: 1, totalParts: 1, totalFiles: 2, excludedPendingUploads: 1,
      files: [{ id, name: "CON.pdf", size: contents[0].length, mimeType: "application/pdf" },
        { id: secondId, name: "CON.pdf", size: contents[1].length, mimeType: "application/pdf" }],
    });
    expect(progress).toHaveBeenLastCalledWith(2, 2);
  });

  it("refuses a tampered file instead of returning a partial archive", async () => {
    const key = await importRawKey("12345678901234567890123456789012");
    const file = await encryptFile(new File(["%PDF-1.7\nexample"], "example.pdf", { type: "application/pdf" }), key, id);
    const bytes = new Uint8Array(await file.ciphertext.arrayBuffer());
    bytes[bytes.length - 1] ^= 1;
    vi.mocked(downloadEncryptedFile).mockResolvedValue(new Blob([bytes]));
    const plan = planFileExport([{ ...record(), encryptedMetadata: file.encryptedMetadata, wrappedKey: file.wrappedKey }], 0);
    await expect(buildFileExportPart(plan, 0, key, "test-token", new AbortController().signal)).rejects.toThrow();
  });

  it("stops before fetching when cancelled and rejects a late download after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(loadFileExportPlan("test-token", controller.signal)).rejects.toThrow();
    expect(fetchEncryptedFiles).not.toHaveBeenCalled();
    const operation = new AbortController();
    vi.mocked(downloadEncryptedFile).mockImplementation(async () => {
      operation.abort();
      return new Blob([new Uint8Array(1048617)]);
    });
    await expect(buildFileExportPart(planFileExport([record()], 0), 0, {} as CryptoKey, "test-token", operation.signal)).rejects.toThrow();
  });

  it("rejects a truncated download before decryption", async () => {
    vi.mocked(downloadEncryptedFile).mockResolvedValue(new Blob(["truncated"]));
    await expect(buildFileExportPart(planFileExport([record()], 0), 0, {} as CryptoKey, "test-token", new AbortController().signal))
      .rejects.toThrow("incomplete");
  });
});
