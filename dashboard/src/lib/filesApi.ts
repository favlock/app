import {
  deleteAuthenticatedWithoutResponse,
  fetchAuthenticatedBlob,
  fetchAuthenticatedJson,
  postAuthenticatedJson,
  putAuthenticatedBlobWithoutResponse,
} from "./authenticatedApi";
import { isValidEncryptedFileCiphertextSize } from "./fileEncryption";

export interface EncryptedFileRecord {
  id: string;
  encryptedMetadata: string;
  wrappedKey: string;
  ciphertextBytes: number;
  formatVersion: 2;
  createdAt: string;
  updatedAt: string;
}

export interface FileStorageUsage {
  usedBytes: number;
  limitBytes: number;
  maxCiphertextBytes: number;
}

export interface EncryptedFileList {
  files: EncryptedFileRecord[];
  usage: FileStorageUsage;
  pendingFiles: Array<{ id: string; ciphertextBytes: number; createdAt: string }>;
}

interface ReserveFileInput {
  fileId: string;
  encryptedMetadata: string;
  wrappedKey: string;
  ciphertextBytes: number;
  formatVersion: 2;
}

const FILES_ERROR = "We could not load your encrypted files. Please try again.";
const FILE_TRANSFER_TIMEOUT_MS = 300_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isByteCount(value: unknown, allowZero = false): value is number {
  return Number.isSafeInteger(value) &&
    (allowZero ? (value as number) >= 0 : (value as number) > 0);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function parseFile(value: unknown): EncryptedFileRecord {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" || !UUID_PATTERN.test(value.id) ||
    typeof value.encryptedMetadata !== "string" || value.encryptedMetadata.length < 1 || value.encryptedMetadata.length > 8192 ||
    typeof value.wrappedKey !== "string" || value.wrappedKey.length < 1 || value.wrappedKey.length > 1024 ||
    !isByteCount(value.ciphertextBytes) ||
    !isValidEncryptedFileCiphertextSize(value.ciphertextBytes) ||
    value.formatVersion !== 2 ||
    !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)
  ) throw new Error(FILES_ERROR);
  return {
    id: value.id,
    encryptedMetadata: value.encryptedMetadata,
    wrappedKey: value.wrappedKey,
    ciphertextBytes: value.ciphertextBytes,
    formatVersion: value.formatVersion,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseFileList(value: unknown): EncryptedFileList {
  if (!isRecord(value) || !isRecord(value.data)) throw new Error(FILES_ERROR);
  const data = value.data;
  if (!Array.isArray(data.files) || data.files.length > 10_000 || !isRecord(data.usage)) {
    throw new Error(FILES_ERROR);
  }
  const usage = data.usage;
  if (
    !isByteCount(usage.usedBytes, true) ||
    !isByteCount(usage.limitBytes) ||
    !isByteCount(usage.maxCiphertextBytes)
  ) throw new Error(FILES_ERROR);
  const pendingFiles = data.pendingFiles ?? [];
  if (!Array.isArray(pendingFiles) || pendingFiles.length > 10_000) throw new Error(FILES_ERROR);
  return {
    pendingFiles: pendingFiles.map((file: unknown) => {
      if (!isRecord(file) || typeof file.id !== "string" || !UUID_PATTERN.test(file.id) ||
        !isValidEncryptedFileCiphertextSize(file.ciphertextBytes) || !isTimestamp(file.createdAt)) {
        throw new Error(FILES_ERROR);
      }
      return { id: file.id, ciphertextBytes: file.ciphertextBytes, createdAt: file.createdAt };
    }),
    files: data.files.map(parseFile),
    usage: {
      usedBytes: usage.usedBytes,
      limitBytes: usage.limitBytes,
      maxCiphertextBytes: usage.maxCiphertextBytes,
    },
  };
}

export async function fetchEncryptedFiles(
  accessToken: string,
  signal?: AbortSignal,
): Promise<EncryptedFileList> {
  return parseFileList(await fetchAuthenticatedJson(
    "/v1/files",
    accessToken,
    FILES_ERROR,
    signal ? { signal } : {},
  ));
}

export async function reserveEncryptedFile(
  accessToken: string,
  input: ReserveFileInput,
): Promise<void> {
  const response = await postAuthenticatedJson(
    "/v1/files",
    accessToken,
    input,
    "We could not reserve storage for this file.",
  );
  if (
    !isRecord(response) || !isRecord(response.data) ||
    response.data.fileId !== input.fileId
  ) throw new Error("We could not reserve storage for this file.");
}

export function uploadEncryptedFile(
  accessToken: string,
  fileId: string,
  ciphertext: Blob,
  signal?: AbortSignal,
): Promise<void> {
  return putAuthenticatedBlobWithoutResponse(
    `/v1/files/${fileId}/content`,
    accessToken,
    ciphertext,
    "We could not upload this encrypted file.",
    { timeoutMs: FILE_TRANSFER_TIMEOUT_MS, ...(signal ? { signal } : {}) },
  );
}

export function downloadEncryptedFile(
  accessToken: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  return fetchAuthenticatedBlob(
    `/v1/files/${fileId}/content`,
    accessToken,
    "We could not download this encrypted file.",
    { timeoutMs: FILE_TRANSFER_TIMEOUT_MS, ...(signal ? { signal } : {}) },
  );
}

export function deleteEncryptedFile(
  accessToken: string,
  fileId: string,
): Promise<void> {
  return deleteAuthenticatedWithoutResponse(
    `/v1/files/${fileId}`,
    accessToken,
    "We could not permanently delete this file.",
  );
}
