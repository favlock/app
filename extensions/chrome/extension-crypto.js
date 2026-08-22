const ENC_PREFIX = "enc:";
const KEY_DB_NAME = "favlock-extension";
const KEY_STORE_NAME = "keys";
const KEY_RECORD_ID = "library-key";

function openKeyDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KEY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(KEY_STORE_NAME)) {
        request.result.createObjectStore(KEY_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function normalizeRawKey(rawKey) {
  const keyMatch = String(rawKey || "").match(
    /[A-Za-z0-9]{4}(?:[\s-]*[A-Za-z0-9]{4}){7}/,
  );
  const clean = (keyMatch?.[0] || String(rawKey || ""))
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 32);
  if (clean.length !== 32) {
    throw new Error("Encryption key must be 32 letters or numbers.");
  }
  return clean;
}

export async function importLibraryKey(rawKey) {
  const bytes = new TextEncoder().encode(normalizeRawKey(rawKey));
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function saveLibraryKey(key) {
  const database = await openKeyDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE_NAME, "readwrite");
    transaction.objectStore(KEY_STORE_NAME).put(key, KEY_RECORD_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function loadLibraryKey() {
  const database = await openKeyDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE_NAME, "readonly");
    const request = transaction.objectStore(KEY_STORE_NAME).get(KEY_RECORD_ID);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteLibraryKey() {
  const database = await openKeyDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE_NAME, "readwrite");
    transaction.objectStore(KEY_STORE_NAME).delete(KEY_RECORD_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export async function encryptField(plaintext, key) {
  if (!key) throw new Error("Unlock FavLock before saving data.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(String(plaintext)),
  );
  const output = new Uint8Array(iv.length + encrypted.byteLength);
  output.set(iv);
  output.set(new Uint8Array(encrypted), iv.length);
  return `${ENC_PREFIX}${bytesToBase64(output)}`;
}

export async function decryptField(value, key) {
  if (!String(value || "").startsWith(ENC_PREFIX)) return String(value || "");
  if (!key) throw new Error("Unlock FavLock to read encrypted data.");
  const bytes = base64ToBytes(String(value).slice(ENC_PREFIX.length));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12) },
    key,
    bytes.slice(12),
  );
  return new TextDecoder().decode(decrypted);
}
