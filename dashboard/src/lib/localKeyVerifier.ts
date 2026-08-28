import { decryptFieldStrict, encryptField, VERIFY_CONSTANT } from "./encryption";

const prefix = "favlock.local-verifier.v1:";

export function readLocalKeyVerifier(userId: string): string | null {
  const value = localStorage.getItem(prefix + userId);
  return value?.startsWith("enc:") && value.length <= 4096 ? value : null;
}

export async function matchesLocalKey(userId: string, key: CryptoKey): Promise<boolean> {
  const verifier = readLocalKeyVerifier(userId);
  if (!verifier) return false;
  try { return await decryptFieldStrict(verifier, key) === VERIFY_CONSTANT; }
  catch { return false; }
}

export async function createLocalKeyVerifier(key: CryptoKey): Promise<string> {
  return encryptField(VERIFY_CONSTANT, key);
}

export function saveLocalKeyVerifier(userId: string, verifier: string): void {
  localStorage.setItem(prefix + userId, verifier);
}

export function clearLocalKeyVerifier(userId: string): void {
  localStorage.removeItem(prefix + userId);
}
