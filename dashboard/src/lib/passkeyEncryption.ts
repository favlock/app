import { formatEncryptionKey, normalizeRawKey } from "./encryption";
import {
  fetchPasskeyEncryptionRecord,
  savePasskeyEncryptionMetadata,
  type PasskeyEncryptionRecord,
} from "./encryptionMetadataApi";

export type { PasskeyEncryptionRecord } from "./encryptionMetadataApi";

const PRF_SALT_LENGTH = 32;
const WRAP_IV_LENGTH = 12;
const WRAP_CONTEXT = "favlock-passkey-key-wrap-v1";

type PrfExtensionInput = {
  prf: {
    eval: {
      first: BufferSource;
    };
  };
};

type PrfExtensionOutput = {
  prf?: {
    enabled?: boolean;
    results?: {
      first?: BufferSource;
    };
  };
};

type PublicKeyCredentialWithPrf = PublicKeyCredential & {
  getClientExtensionResults(): AuthenticationExtensionsClientOutputs &
    PrfExtensionOutput;
};

function getWebAuthnApi(): CredentialsContainer {
  if (
    !globalThis.PublicKeyCredential ||
    !globalThis.navigator?.credentials
  ) {
    throw new Error("Passkeys are not supported by this browser.");
  }

  return globalThis.navigator.credentials;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

function toBase64Url(value: BufferSource): string {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function getPrfResult(credential: PublicKeyCredential): BufferSource | null {
  const results = (
    credential as PublicKeyCredentialWithPrf
  ).getClientExtensionResults();
  return results.prf?.results?.first ?? null;
}

function copyBufferSource(value: BufferSource): Uint8Array<ArrayBuffer> {
  if (ArrayBuffer.isView(value)) {
    return Uint8Array.from(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    );
  }

  return Uint8Array.from(new Uint8Array(value));
}

function passkeyError(error: unknown, action: "create" | "use"): Error {
  if (!(error instanceof DOMException)) {
    return error instanceof Error
      ? error
      : new Error(`Could not ${action} the passkey.`);
  }

  if (error.name === "NotAllowedError") {
    return new Error(
      action === "create"
        ? "Passkey creation was cancelled or timed out."
        : "Passkey verification was cancelled or timed out.",
    );
  }

  if (error.name === "SecurityError") {
    return new Error("Passkeys require a secure HTTPS connection.");
  }

  if (error.name === "NotSupportedError") {
    return new Error(
      "This browser or passkey provider cannot protect the encryption key.",
    );
  }

  return new Error(`Could not ${action} the passkey. Try again.`);
}

async function deriveWrappingKey(prfResult: BufferSource): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    copyBufferSource(prfResult),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function wrapAdditionalData(userId: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${WRAP_CONTEXT}:${userId}`);
}

async function evaluatePrf(
  credentialId: BufferSource,
  salt: BufferSource,
): Promise<BufferSource> {
  const credentials = getWebAuthnApi();
  const extensions: PrfExtensionInput = {
    prf: { eval: { first: salt } },
  };

  let assertion: Credential | null;
  try {
    assertion = await credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [
          {
            type: "public-key",
            id: credentialId,
          },
        ],
        userVerification: "required",
        timeout: 60_000,
        extensions: extensions as AuthenticationExtensionsClientInputs,
      },
    });
  } catch (error) {
    throw passkeyError(error, "use");
  }

  if (!(assertion instanceof PublicKeyCredential)) {
    throw new Error("The selected passkey could not be used.");
  }

  const prfResult = getPrfResult(assertion);
  if (!prfResult) {
    throw new Error(
      "This passkey provider does not support encrypted-key protection.",
    );
  }

  return prfResult;
}

export async function supportsPasskeyEncryption(): Promise<boolean> {
  return !!(
    globalThis.PublicKeyCredential && globalThis.navigator?.credentials
  );
}

export async function createPasskeyEncryptionRecord({
  rawKey,
  userId,
  userName,
  displayName,
}: {
  rawKey: string;
  userId: string;
  userName: string;
  displayName: string;
}): Promise<PasskeyEncryptionRecord> {
  const credentials = getWebAuthnApi();
  const salt = randomBytes(PRF_SALT_LENGTH);
  const extensions: PrfExtensionInput = {
    prf: { eval: { first: salt } },
  };

  let created: Credential | null;
  try {
    created = await credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: "FavLock" },
        user: {
          id: new TextEncoder().encode(userId),
          name: userName,
          displayName,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          residentKey: "required",
          requireResidentKey: true,
          userVerification: "required",
        },
        attestation: "none",
        timeout: 60_000,
        extensions: extensions as AuthenticationExtensionsClientInputs,
      },
    });
  } catch (error) {
    throw passkeyError(error, "create");
  }

  if (!(created instanceof PublicKeyCredential)) {
    throw new Error("The passkey could not be created.");
  }

  const creationExtensions = (
    created as PublicKeyCredentialWithPrf
  ).getClientExtensionResults();
  if (creationExtensions.prf?.enabled === false) {
    throw new Error(
      "This passkey provider does not support encrypted-key protection.",
    );
  }

  let prfResult = getPrfResult(created);
  if (!prfResult) {
    prfResult = await evaluatePrf(created.rawId, salt);
  }

  const wrappingKey = await deriveWrappingKey(prfResult);
  const iv = randomBytes(WRAP_IV_LENGTH);
  const cleanKey = normalizeRawKey(rawKey);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: wrapAdditionalData(userId),
    },
    wrappingKey,
    new TextEncoder().encode(cleanKey),
  );
  const wrappedKey = new Uint8Array(iv.length + ciphertext.byteLength);
  wrappedKey.set(iv);
  wrappedKey.set(new Uint8Array(ciphertext), iv.length);

  return {
    credentialId: toBase64Url(created.rawId),
    prfSalt: toBase64Url(salt),
    wrappedKey: toBase64Url(wrappedKey),
  };
}

export async function unwrapEncryptionKeyWithPasskey(
  record: PasskeyEncryptionRecord,
  userId: string,
): Promise<string> {
  const credentialId = fromBase64Url(record.credentialId);
  const salt = fromBase64Url(record.prfSalt);
  const wrappedKey = fromBase64Url(record.wrappedKey);
  if (wrappedKey.byteLength <= WRAP_IV_LENGTH) {
    throw new Error("The saved passkey data is invalid.");
  }

  const prfResult = await evaluatePrf(credentialId, salt);
  const wrappingKey = await deriveWrappingKey(prfResult);

  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: wrappedKey.slice(0, WRAP_IV_LENGTH),
        additionalData: wrapAdditionalData(userId),
      },
      wrappingKey,
      wrappedKey.slice(WRAP_IV_LENGTH),
    );
    return formatEncryptionKey(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error(
      "This passkey does not match the saved encryption key.",
    );
  }
}

export async function savePasskeyEncryptionRecord(
  accessToken: string,
  record: PasskeyEncryptionRecord,
): Promise<void> {
  try {
    await savePasskeyEncryptionMetadata(accessToken, record);
  } catch {
    throw new Error("The passkey was created, but it could not be saved.");
  }
}

export async function loadPasskeyEncryptionRecord(
  accessToken: string,
): Promise<PasskeyEncryptionRecord | null> {
  return fetchPasskeyEncryptionRecord(accessToken);
}
