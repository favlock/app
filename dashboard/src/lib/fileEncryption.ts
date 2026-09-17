import { decryptFieldStrict, encryptField } from "./encryption";

export const FILE_FORMAT_VERSION = 2;
export const FILE_CHUNK_SIZE = 1024 * 1024;
export const FREE_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const PRO_FILE_MAX_BYTES = 100 * 1024 * 1024;

const MAGIC: Uint8Array<ArrayBuffer> = new TextEncoder().encode("FavLock1");
const HEADER_BYTES = MAGIC.byteLength + 1 + 4 + 4 + 8;
const TAG_BYTES = 16;
const MAX_FILE_CHUNKS = PRO_FILE_MAX_BYTES / FILE_CHUNK_SIZE;
const BOUND_KEY_PREFIX = "fwk:2:";
const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export interface FileMetadata {
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  lastModified: number;
}

export interface EncryptedFilePayload {
  fileId: string;
  ciphertext: Blob;
  encryptedMetadata: string;
  wrappedKey: string;
  formatVersion: typeof FILE_FORMAT_VERSION;
}

export function isValidEncryptedFileCiphertextSize(
  value: unknown,
): value is number {
  const encryptedChunkBytes = FILE_CHUNK_SIZE + TAG_BYTES;
  return Number.isSafeInteger(value) &&
    (value as number) >= HEADER_BYTES + encryptedChunkBytes &&
    (value as number) <= HEADER_BYTES + MAX_FILE_CHUNKS * encryptedChunkBytes &&
    ((value as number) - HEADER_BYTES) % encryptedChunkBytes === 0;
}

function browserCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("File encryption requires HTTPS or localhost.");
  }
  return globalThis.crypto;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function chunkIv(
  noncePrefix: Uint8Array<ArrayBuffer>,
  index: number,
): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(12);
  iv.set(noncePrefix, 0);
  new DataView(iv.buffer).setUint32(8, index, false);
  return iv;
}

function chunkAad(
  header: Uint8Array<ArrayBuffer>,
  index: number,
  binding: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  const aad = new Uint8Array(header.byteLength + 4 + binding.byteLength);
  aad.set(header);
  new DataView(aad.buffer).setUint32(header.byteLength, index, false);
  aad.set(binding, header.byteLength + 4);
  return aad;
}

function createHeader(
  chunkCount: number,
  noncePrefix: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(HEADER_BYTES);
  header.set(MAGIC, 0);
  const view = new DataView(header.buffer);
  view.setUint8(MAGIC.byteLength, FILE_FORMAT_VERSION);
  view.setUint32(MAGIC.byteLength + 1, FILE_CHUNK_SIZE, false);
  view.setUint32(MAGIC.byteLength + 5, chunkCount, false);
  header.set(noncePrefix, MAGIC.byteLength + 9);
  return header;
}

function parseHeader(bytes: Uint8Array<ArrayBuffer>): {
  header: Uint8Array<ArrayBuffer>;
  chunkCount: number;
  noncePrefix: Uint8Array<ArrayBuffer>;
} {
  if (bytes.byteLength < HEADER_BYTES) throw new Error("Encrypted file is incomplete.");
  const header = bytes.slice(0, HEADER_BYTES);
  if (MAGIC.some((value, index) => header[index] !== value)) {
    throw new Error("Encrypted file format is not supported.");
  }
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const version = view.getUint8(MAGIC.byteLength);
  if (version !== FILE_FORMAT_VERSION) {
    throw new Error("Encrypted file format is not supported.");
  }
  const chunkSize = view.getUint32(MAGIC.byteLength + 1, false);
  const chunkCount = view.getUint32(MAGIC.byteLength + 5, false);
  if (chunkSize !== FILE_CHUNK_SIZE || chunkCount < 1 || chunkCount > MAX_FILE_CHUNKS) {
    throw new Error("Encrypted file header is invalid.");
  }
  return {
    header,
    chunkCount,
    noncePrefix: header.slice(MAGIC.byteLength + 9, HEADER_BYTES),
  };
}

async function sniffMimeType(file: Blob): Promise<string> {
  const signature = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = String.fromCharCode(...signature);
  if (ascii.startsWith("%PDF-")) return "application/pdf";
  if (
    signature.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => signature[index] === value,
    )
  ) return "image/png";
  if (signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff) {
    return "image/jpeg";
  }
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "image/gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  throw new Error("Choose a PDF, JPEG, PNG, WebP, or GIF file.");
}

function parseMetadata(value: string): FileMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Encrypted file metadata is damaged.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Encrypted file metadata is damaged.");
  }
  const metadata = parsed as Record<string, unknown>;
  if (
    typeof metadata.fileId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(metadata.fileId) ||
    typeof metadata.name !== "string" || !isSafeFileName(metadata.name) ||
    typeof metadata.mimeType !== "string" || !SUPPORTED_MIME_TYPES.has(metadata.mimeType) ||
    !Number.isSafeInteger(metadata.size) || (metadata.size as number) < 1 || (metadata.size as number) > PRO_FILE_MAX_BYTES ||
    !Number.isSafeInteger(metadata.lastModified) || (metadata.lastModified as number) < 0
  ) {
    throw new Error("Encrypted file metadata is invalid.");
  }
  return metadata as unknown as FileMetadata;
}

function isSafeFileName(value: string): boolean {
  const hasUnsupportedCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 || character === "/" || character === "\\";
  });
  return value.trim().length > 0 &&
    value.length <= 255 &&
    !hasUnsupportedCharacter;
}

async function metadataBinding(encryptedMetadata: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await browserCrypto().subtle.digest(
    "SHA-256", new TextEncoder().encode(encryptedMetadata),
  ));
}

function boundWrapAad(binding: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const domain = new TextEncoder().encode("favlock-file-key-v2");
  const aad = new Uint8Array(domain.length + binding.length);
  aad.set(domain);
  aad.set(binding, domain.length);
  return aad;
}

async function wrapFileKey(fileKey: CryptoKey, masterKey: CryptoKey, binding: Uint8Array<ArrayBuffer>): Promise<string> {
  const rawKey = new Uint8Array(await browserCrypto().subtle.exportKey("raw", fileKey));
  const iv = browserCrypto().getRandomValues(new Uint8Array(12));
  try {
    const wrapped = await browserCrypto().subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: boundWrapAad(binding), tagLength: 128 },
      masterKey,
      rawKey,
    );
    const serialized = new Uint8Array(iv.byteLength + wrapped.byteLength);
    serialized.set(iv);
    serialized.set(new Uint8Array(wrapped), iv.byteLength);
    return BOUND_KEY_PREFIX + toBase64(serialized);
  } finally {
    rawKey.fill(0);
  }
}

async function unwrapFileKey(value: string, masterKey: CryptoKey, binding: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const prefix = BOUND_KEY_PREFIX;
  if (!value.startsWith(prefix)) {
    throw new Error("Wrapped file key format is not supported.");
  }
  const serialized = fromBase64(value.slice(prefix.length));
  if (serialized.byteLength !== 12 + 32 + TAG_BYTES) {
    throw new Error("Wrapped file key is invalid.");
  }
  const rawKey = new Uint8Array(await browserCrypto().subtle.decrypt(
    {
      name: "AES-GCM",
      iv: serialized.slice(0, 12),
      additionalData: boundWrapAad(binding),
      tagLength: 128,
    },
    masterKey,
    serialized.slice(12),
  ));
  try {
    return await browserCrypto().subtle.importKey(
      "raw",
      rawKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
  } finally {
    rawKey.fill(0);
  }
}

export async function encryptFile(
  file: File,
  masterKey: CryptoKey,
  fileId: string = crypto.randomUUID(),
  signal?: AbortSignal,
): Promise<EncryptedFilePayload> {
  signal?.throwIfAborted();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId)) {
    throw new Error("The file identifier is invalid.");
  }
  if (file.size < 1 || file.size > PRO_FILE_MAX_BYTES) {
    throw new Error("The file must be between 1 byte and 100 MB.");
  }
  if (!isSafeFileName(file.name)) {
    throw new Error("The filename contains unsupported characters.");
  }
  const mimeType = await sniffMimeType(file);
  const metadata: FileMetadata = {
    fileId,
    name: file.name,
    mimeType,
    size: file.size,
    lastModified: Math.max(0, Math.trunc(file.lastModified)),
  };
  const encryptedMetadata = await encryptField(JSON.stringify(metadata), masterKey);
  const binding = await metadataBinding(encryptedMetadata);
  const fileKey = await browserCrypto().subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const chunkCount = Math.ceil(file.size / FILE_CHUNK_SIZE);
  const noncePrefix = browserCrypto().getRandomValues(new Uint8Array(8));
  const header = createHeader(chunkCount, noncePrefix);
  const parts: BlobPart[] = [header];

  for (let index = 0; index < chunkCount; index += 1) {
    signal?.throwIfAborted();
    const source = new Uint8Array(
      await file
        .slice(index * FILE_CHUNK_SIZE, (index + 1) * FILE_CHUNK_SIZE)
        .arrayBuffer(),
    );
    const padded = new Uint8Array(FILE_CHUNK_SIZE);
    padded.set(source);
    const encrypted = await browserCrypto().subtle.encrypt(
      {
        name: "AES-GCM",
        iv: chunkIv(noncePrefix, index),
        additionalData: chunkAad(header, index, binding),
        tagLength: 128,
      },
      fileKey,
      padded,
    );
    padded.fill(0);
    source.fill(0);
    parts.push(encrypted);
  }

  signal?.throwIfAborted();
  return {
    fileId,
    ciphertext: new Blob(parts, { type: "application/octet-stream" }),
    encryptedMetadata,
    wrappedKey: await wrapFileKey(fileKey, masterKey, binding),
    formatVersion: FILE_FORMAT_VERSION,
  };
}

export async function decryptFileMetadata(
  encryptedMetadata: string,
  masterKey: CryptoKey,
  expectedFileId: string,
): Promise<FileMetadata> {
  const metadata = parseMetadata(await decryptFieldStrict(encryptedMetadata, masterKey));
  if (metadata.fileId !== expectedFileId) {
    throw new Error("Encrypted file identity does not match its metadata.");
  }
  return metadata;
}

export async function decryptFile(
  ciphertext: Blob,
  encryptedMetadata: string,
  wrappedKey: string,
  masterKey: CryptoKey,
  expectedFileId: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; metadata: FileMetadata }> {
  signal?.throwIfAborted();
  const metadata = await decryptFileMetadata(encryptedMetadata, masterKey, expectedFileId);
  const prefix = new Uint8Array(await ciphertext.slice(0, HEADER_BYTES).arrayBuffer());
  const { header, chunkCount, noncePrefix } = parseHeader(prefix);
  const binding = await metadataBinding(encryptedMetadata);
  const encryptedChunkBytes = FILE_CHUNK_SIZE + TAG_BYTES;
  const expectedBytes = HEADER_BYTES + chunkCount * encryptedChunkBytes;
  const expectedChunks = Math.ceil(metadata.size / FILE_CHUNK_SIZE);
  if (ciphertext.size !== expectedBytes || chunkCount !== expectedChunks) {
    throw new Error("Encrypted file size does not match its metadata.");
  }
  const fileKey = await unwrapFileKey(wrappedKey, masterKey, binding);
  const parts: BlobPart[] = [];
  let remaining = metadata.size;

  for (let index = 0; index < chunkCount; index += 1) {
    signal?.throwIfAborted();
    const offset = HEADER_BYTES + index * encryptedChunkBytes;
    const encryptedChunk = await ciphertext
      .slice(offset, offset + encryptedChunkBytes)
      .arrayBuffer();
    const decrypted = await browserCrypto().subtle.decrypt(
      {
        name: "AES-GCM",
        iv: chunkIv(noncePrefix, index),
        additionalData: chunkAad(header, index, binding),
        tagLength: 128,
      },
      fileKey,
      encryptedChunk,
    );
    const take = Math.min(remaining, FILE_CHUNK_SIZE);
    parts.push(decrypted.slice(0, take));
    remaining -= take;
  }
  signal?.throwIfAborted();
  if (remaining !== 0) throw new Error("Encrypted file is incomplete.");
  return { blob: new Blob(parts, { type: metadata.mimeType }), metadata };
}
