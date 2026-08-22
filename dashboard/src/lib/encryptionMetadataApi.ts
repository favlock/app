import {
  fetchAuthenticatedJson,
  putAuthenticatedJsonWithoutResponse,
} from "./authenticatedApi";

const VERIFIER_ERROR =
  "We could not access your encryption verifier. Please try again.";
const PASSKEY_LOAD_ERROR =
  "We could not load your passkey encryption record. Please try again.";
const PASSKEY_SAVE_ERROR =
  "We could not save your passkey encryption record. Please try again.";

const ENCRYPTION_VERIFIER_PATTERN = /^enc:[A-Za-z0-9+/]+={0,2}$/;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface PasskeyEncryptionRecord {
  credentialId: string;
  prfSalt: string;
  wrappedKey: string;
}

function isVerifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 5 &&
    value.length <= 512 &&
    ENCRYPTION_VERIFIER_PATTERN.test(value)
  );
}

function isBase64UrlWithLength(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum &&
    BASE64_URL_PATTERN.test(value)
  );
}

function parsePasskeyRecord(
  value: unknown,
  failureMessage: string,
): PasskeyEncryptionRecord | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new Error(failureMessage);
  const record = value as Record<string, unknown>;
  if (
    !isBase64UrlWithLength(record.credentialId, 1, 4_096) ||
    !isBase64UrlWithLength(record.prfSalt, 43, 43) ||
    !isBase64UrlWithLength(record.wrappedKey, 80, 80)
  ) {
    throw new Error(failureMessage);
  }
  return {
    credentialId: record.credentialId,
    prfSalt: record.prfSalt,
    wrappedKey: record.wrappedKey,
  };
}

export async function fetchEncryptionVerifier(
  accessToken: string,
): Promise<string | null> {
  const payload = await fetchAuthenticatedJson(
    "/v1/account/encryption/verifier",
    accessToken,
    VERIFIER_ERROR,
  );
  if (!payload || typeof payload !== "object") throw new Error(VERIFIER_ERROR);
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== "object") throw new Error(VERIFIER_ERROR);
  const verifier = (data as Record<string, unknown>).verifier;
  if (verifier === null) return null;
  if (!isVerifier(verifier)) throw new Error(VERIFIER_ERROR);
  return verifier;
}

export async function saveEncryptionVerifier(
  accessToken: string,
  verifier: string,
): Promise<void> {
  if (!isVerifier(verifier)) throw new Error(VERIFIER_ERROR);
  await putAuthenticatedJsonWithoutResponse(
    "/v1/account/encryption/verifier",
    accessToken,
    { verifier },
    VERIFIER_ERROR,
  );
}

export async function fetchPasskeyEncryptionRecord(
  accessToken: string,
): Promise<PasskeyEncryptionRecord | null> {
  const payload = await fetchAuthenticatedJson(
    "/v1/account/encryption/passkey",
    accessToken,
    PASSKEY_LOAD_ERROR,
  );
  if (!payload || typeof payload !== "object") {
    throw new Error(PASSKEY_LOAD_ERROR);
  }
  return parsePasskeyRecord(
    (payload as Record<string, unknown>).data,
    PASSKEY_LOAD_ERROR,
  );
}

export async function savePasskeyEncryptionMetadata(
  accessToken: string,
  record: PasskeyEncryptionRecord,
): Promise<void> {
  const validated = parsePasskeyRecord(record, PASSKEY_SAVE_ERROR);
  if (!validated) throw new Error(PASSKEY_SAVE_ERROR);
  await putAuthenticatedJsonWithoutResponse(
    "/v1/account/encryption/passkey",
    accessToken,
    validated,
    PASSKEY_SAVE_ERROR,
  );
}
