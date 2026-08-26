import type { FavLockExport } from "./dataExport";

export const ENCRYPTED_ARCHIVE_FORMAT = "favlock-encrypted-export" as const;
export const ENCRYPTED_ARCHIVE_VERSION = 2 as const;
export const ENCRYPTED_ARCHIVE_MAX_FILE_BYTES = 100 * 1024 * 1024;

const IV_BYTES = 12;
const TAG_LENGTH = 128;
const ARCHIVE_AAD = new TextEncoder().encode(
  `${ENCRYPTED_ARCHIVE_FORMAT}:${ENCRYPTED_ARCHIVE_VERSION}`,
);

export interface EncryptedFavLockArchive {
  format: typeof ENCRYPTED_ARCHIVE_FORMAT;
  version: typeof ENCRYPTED_ARCHIVE_VERSION;
  encryption: {
    algorithm: "AES-GCM";
    keyLength: 256;
    tagLength: 128;
    iv: string;
  };
  key: {
    type: "favlock-recovery-key";
  };
  payload: {
    contentType: "application/vnd.favlock.export+json";
    encoding: "utf-8";
    ciphertext: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string, expectedLength?: number): Uint8Array {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new Error("The encrypted archive is not valid.");
  }

  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("The encrypted archive is not valid.");
  }
  if (expectedLength !== undefined && binary.length !== expectedLength) {
    throw new Error("The encrypted archive is not valid.");
  }

  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    result[index] = binary.charCodeAt(index);
  }
  return result;
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  const result = new Uint8Array(bytes.byteLength);
  result.set(bytes);
  return result.buffer;
}

function parseEnvelope(value: unknown): EncryptedFavLockArchive {
  if (
    !isRecord(value) ||
    value.format !== ENCRYPTED_ARCHIVE_FORMAT ||
    value.version !== ENCRYPTED_ARCHIVE_VERSION ||
    !isRecord(value.encryption) ||
    value.encryption.algorithm !== "AES-GCM" ||
    value.encryption.keyLength !== 256 ||
    value.encryption.tagLength !== TAG_LENGTH ||
    typeof value.encryption.iv !== "string" ||
    !isRecord(value.key) ||
    value.key.type !== "favlock-recovery-key" ||
    !isRecord(value.payload) ||
    value.payload.contentType !== "application/vnd.favlock.export+json" ||
    value.payload.encoding !== "utf-8" ||
    typeof value.payload.ciphertext !== "string"
  ) {
    throw new Error("The encrypted archive is not valid or is unsupported.");
  }

  return value as unknown as EncryptedFavLockArchive;
}

export async function encryptFavLockArchive(
  archive: FavLockExport,
  encryptionKey: CryptoKey,
): Promise<EncryptedFavLockArchive> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(archive));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: ownedBuffer(iv),
      additionalData: ownedBuffer(ARCHIVE_AAD),
      tagLength: TAG_LENGTH,
    },
    encryptionKey,
    ownedBuffer(plaintext),
  );

  return {
    format: ENCRYPTED_ARCHIVE_FORMAT,
    version: ENCRYPTED_ARCHIVE_VERSION,
    encryption: {
      algorithm: "AES-GCM",
      keyLength: 256,
      tagLength: TAG_LENGTH,
      iv: bytesToBase64(iv),
    },
    key: {
      type: "favlock-recovery-key",
    },
    payload: {
      contentType: "application/vnd.favlock.export+json",
      encoding: "utf-8",
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    },
  };
}

export async function decryptFavLockArchive(
  encryptedArchive: unknown,
  encryptionKey: CryptoKey,
): Promise<unknown> {
  const envelope = parseEnvelope(encryptedArchive);
  const iv = base64ToBytes(envelope.encryption.iv, IV_BYTES);
  const ciphertext = base64ToBytes(envelope.payload.ciphertext);
  if (ciphertext.byteLength < TAG_LENGTH / 8) {
    throw new Error("The encrypted archive is not valid.");
  }

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ownedBuffer(iv),
        additionalData: ownedBuffer(ARCHIVE_AAD),
        tagLength: TAG_LENGTH,
      },
      encryptionKey,
      ownedBuffer(ciphertext),
    );
  } catch {
    throw new Error(
      "Could not decrypt this archive. The recovery key may be incorrect or the file may be damaged.",
    );
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decrypted));
  } catch {
    throw new Error("The decrypted archive does not contain valid FavLock data.");
  }
}

export function serializeEncryptedFavLockArchive(
  archive: EncryptedFavLockArchive,
): string {
  return `${JSON.stringify(archive, null, 2)}\n`;
}

export function parseEncryptedFavLockArchiveFile(contents: string): unknown {
  if (new TextEncoder().encode(contents).byteLength > ENCRYPTED_ARCHIVE_MAX_FILE_BYTES) {
    throw new Error("The encrypted archive is too large.");
  }
  try {
    return JSON.parse(contents);
  } catch {
    throw new Error("The selected file is not a valid FavLock archive.");
  }
}
