import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { decryptFile, FILE_CHUNK_SIZE, isValidEncryptedFileCiphertextSize } from "./fileEncryption";
import { downloadEncryptedFile, fetchEncryptedFiles, type EncryptedFileRecord } from "./filesApi";

// Independent ZIPs avoid buffering the entire 5 GiB library or requiring a
// browser-specific filesystem API. Account for padding when planning parts.
export const FILE_EXPORT_PART_BYTES = 128 * 1024 * 1024;
export const FILE_EXPORT_PART_COUNT = 100;

export interface FileExportPlan {
  exportedAt: string;
  parts: EncryptedFileRecord[][];
  fileCount: number;
  pendingCount: number;
}

export function planFileExport(files: EncryptedFileRecord[], pendingCount: number): FileExportPlan {
  const ids = new Set<string>();
  if (files.length > 10_000 || !Number.isSafeInteger(pendingCount) || pendingCount < 0) {
    throw new Error("Invalid file export list.");
  }
  const parts: EncryptedFileRecord[][] = [];
  let part: EncryptedFileRecord[] = [];
  let bytes = 0;
  for (const file of [...files].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(file.id)
      || ids.has(file.id.toLowerCase()) || !isValidEncryptedFileCiphertextSize(file.ciphertextBytes)
      || file.formatVersion !== 2) throw new Error("Invalid file export list.");
    ids.add(file.id.toLowerCase());
    if (part.length && (bytes + file.ciphertextBytes > FILE_EXPORT_PART_BYTES || part.length === FILE_EXPORT_PART_COUNT)) {
      parts.push(part); part = []; bytes = 0;
    }
    part.push(file); bytes += file.ciphertextBytes;
  }
  if (part.length) parts.push(part);
  return { exportedAt: new Date().toISOString(), parts, fileCount: files.length, pendingCount };
}

export async function loadFileExportPlan(accessToken: string, signal: AbortSignal): Promise<FileExportPlan> {
  signal.throwIfAborted();
  const listing = await fetchEncryptedFiles(accessToken, signal);
  signal.throwIfAborted();
  return planFileExport(listing.files, listing.pendingFiles.length);
}

function safeFilename(name: string): string {
  // The original name remains in the manifest. Never emit traversal paths,
  // drive prefixes, control characters, or Windows reserved device names.
  let safe = [...name.normalize("NFC")].map((char) => {
    const code = char.codePointAt(0)!;
    return code < 32 || code === 127 || /[<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/u.test(char) ? "_" : char;
  }).join("").replace(/^\.+|[. ]+$/g, "").trim();
  // Bound encoded path length on common filesystems without splitting Unicode.
  while (new TextEncoder().encode(safe).length > 180) safe = [...safe].slice(0, -1).join("");
  if (!safe) safe = "file";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = `_${safe}`;
  return safe;
}

export async function buildFileExportPart(
  plan: FileExportPlan,
  partIndex: number,
  masterKey: CryptoKey,
  accessToken: string,
  signal: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<Blob> {
  signal.throwIfAborted();
  const files = plan.parts[partIndex];
  if (!files?.length || files.length > FILE_EXPORT_PART_COUNT
    || files.reduce((sum, file) => sum + file.ciphertextBytes, 0) > FILE_EXPORT_PART_BYTES) {
    throw new Error("Invalid file export part.");
  }
  const chunks: BlobPart[] = [];
  let finished = false;
  let outputBytes = 0;
  const zip = new Zip((error, data, final) => {
    if (error) throw error;
    signal.throwIfAborted();
    outputBytes += data.byteLength;
    if (outputBytes > FILE_EXPORT_PART_BYTES + 1024 * 1024) throw new Error("File export part is too large.");
    chunks.push(new Uint8Array(data).buffer);
    finished = final;
  });
  const manifest: Array<{
    id: string; path: string; name: string; mimeType: string; size: number; lastModified: number;
  }> = [];
  try {
    onProgress?.(0, files.length);
    for (const file of files) {
      signal.throwIfAborted();
      const ciphertext = await downloadEncryptedFile(accessToken, file.id, signal);
      signal.throwIfAborted();
      if (ciphertext.size !== file.ciphertextBytes) throw new Error("File export content changed or is incomplete.");
      const { blob, metadata } = await decryptFile(
        ciphertext, file.encryptedMetadata, file.wrappedKey, masterKey, file.id, signal,
      );
      signal.throwIfAborted();
      const path = `files/${file.id.toLowerCase()}/${safeFilename(metadata.name)}`;
      const entry = new ZipPassThrough(path);
      // ZIP DOS dates are bounded; preserve the exact original in the manifest.
      entry.mtime = new Date(Math.min(Math.max(metadata.lastModified, Date.UTC(1980, 0, 2)), Date.UTC(2099, 11, 30)));
      zip.add(entry);
      for (let offset = 0; offset < blob.size; offset += FILE_CHUNK_SIZE) {
        const bytes = new Uint8Array(await blob.slice(offset, offset + FILE_CHUNK_SIZE).arrayBuffer());
        signal.throwIfAborted();
        entry.push(bytes, offset + FILE_CHUNK_SIZE >= blob.size);
      }
      manifest.push({ id: file.id, path, name: metadata.name, mimeType: metadata.mimeType, size: metadata.size, lastModified: metadata.lastModified });
      onProgress?.(manifest.length, files.length);
    }
    const index = new ZipPassThrough("manifest.json");
    zip.add(index);
    index.push(strToU8(JSON.stringify({
      format: "favlock-files-export", version: 1, exportedAt: plan.exportedAt,
      part: partIndex + 1, totalParts: plan.parts.length,
      totalFiles: plan.fileCount, excludedPendingUploads: plan.pendingCount, files: manifest,
    }, null, 2)), true);
    zip.end();
    signal.throwIfAborted();
    if (!finished) throw new Error("File export is incomplete.");
    return new Blob(chunks, { type: "application/zip" });
  } finally {
    zip.terminate();
    chunks.length = 0;
  }
}
