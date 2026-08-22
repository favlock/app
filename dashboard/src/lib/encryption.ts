export const ENC_PREFIX = 'enc:';
export const STORAGE_KEY = 'zk_enc_key';
export const VERIFY_CONSTANT = 'zk-verify-v1';

const IDB_DB_NAME = 'enc-store';
const IDB_STORE_NAME = 'keys';

export function generateEncryptionKey(): string {
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return formatEncryptionKey(
    Array.from(bytes)
      .map((byte) => chars[byte % chars.length])
      .join(''),
  );
}

export function formatEncryptionKey(rawKey: string): string {
  return normalizeRawKey(rawKey).match(/.{4}/g)!.join(' ');
}

function openEncDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveKeyToIDB(key: CryptoKey): Promise<void> {
  const db = await openEncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    tx.objectStore(IDB_STORE_NAME).put(key, STORAGE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadKeyFromIDB(): Promise<CryptoKey | null> {
  const db = await openEncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readonly');
    const req = tx.objectStore(IDB_STORE_NAME).get(STORAGE_KEY);
    req.onsuccess = () => resolve((req.result as CryptoKey) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteKeyFromIDB(): Promise<void> {
  const db = await openEncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    tx.objectStore(IDB_STORE_NAME).delete(STORAGE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function getBrowserCrypto(): Crypto {
  if (!globalThis.crypto) {
    throw new Error('Encryption requires browser crypto support.');
  }

  return globalThis.crypto;
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = getBrowserCrypto().subtle;
  if (!subtle) {
    throw new Error(
      'Encryption requires HTTPS or localhost. Open the app over HTTPS, then upload the key again.',
    );
  }

  return subtle;
}

export function normalizeRawKey(rawKey: string): string {
  const keyMatch = rawKey.match(/[A-Za-z0-9]{4}(?:[\s-]*[A-Za-z0-9]{4}){7}/);
  const clean = (keyMatch?.[0] ?? rawKey).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);

  if (clean.length !== 32) {
    throw new Error('Encryption key must be 32 letters or numbers.');
  }

  return clean;
}

export async function importRawKey(rawKey: string): Promise<CryptoKey> {
  const clean = normalizeRawKey(rawKey);
  const keyBytes = new TextEncoder().encode(clean);
  return getSubtleCrypto().importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function exportRawKey(key: CryptoKey): Promise<string> {
  const raw = await getSubtleCrypto().exportKey('raw', key);
  return new TextDecoder().decode(raw);
}

export async function encryptField(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = getBrowserCrypto().getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await getSubtleCrypto().encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const out = new Uint8Array(12 + cipher.byteLength);
  out.set(iv);
  out.set(new Uint8Array(cipher), 12);
  return ENC_PREFIX + toBase64(out);
}

export async function decryptField(value: string, key: CryptoKey): Promise<string> {
  if (!value.startsWith(ENC_PREFIX)) return value;
  try {
    const raw = atob(value.slice(ENC_PREFIX.length));
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const plain = await getSubtleCrypto().decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      key,
      bytes.slice(12),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return value;
  }
}

/** Like decryptField but throws on decryption failure (wrong key). */
export async function decryptFieldStrict(value: string, key: CryptoKey): Promise<string> {
  if (!value.startsWith(ENC_PREFIX)) return value;
  const raw = atob(value.slice(ENC_PREFIX.length));
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  const plain = await getSubtleCrypto().decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12) },
    key,
    bytes.slice(12),
  );
  return new TextDecoder().decode(plain);
}
