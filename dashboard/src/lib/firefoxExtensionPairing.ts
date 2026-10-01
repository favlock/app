export const FIREFOX_EXTENSION_ID = "firefox@favlock.app";
const EXTENSION_PAIRING_ATTEMPT_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const EXTENSION_PAIR_KEY_MESSAGE = "favlock.firefox.pair-key";
const EXTENSION_PAIR_REQUEST_MESSAGE = "favlock.firefox.pair-request";
const EXTENSION_PAIR_RESPONSE_MESSAGE = "favlock.firefox.pair-response";

export function isAllowedFavLockExtensionId(
  extensionId: string | null,
  configuredExtensionId: string | undefined,
): extensionId is string {
  return (
    isFirefoxExtensionId(extensionId) &&
    isFirefoxExtensionId(configuredExtensionId ?? null) &&
    extensionId === configuredExtensionId
  );
}

function sendEncryptionKeyThroughPageBridge({
  extensionId,
  pairingAttempt,
  userId,
  rawKey,
  sessionTokenHash,
}: {
  extensionId: string;
  pairingAttempt?: string;
  userId: string;
  rawKey: string;
  sessionTokenHash: string;
}): Promise<void> {
  const requestId = globalThis.crypto.randomUUID();

  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", receiveResponse);
      reject(
        new Error(
          "FavLock could not reach the extension. Reload it in about:debugging#/runtime/this-firefox, then reload this page.",
        ),
      );
    }, 15_000);

    function receiveResponse(event: MessageEvent) {
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        event.data?.type !== EXTENSION_PAIR_RESPONSE_MESSAGE ||
        event.data?.requestId !== requestId
      ) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener("message", receiveResponse);
      if (event.data.ok === true) {
        resolve();
      } else {
        reject(new Error(event.data.error || "The extension rejected the key."));
      }
    }

    window.addEventListener("message", receiveResponse);
    window.postMessage(
      {
        type: EXTENSION_PAIR_REQUEST_MESSAGE,
        requestId,
        extensionId,
        ...(pairingAttempt ? { pairingAttempt } : {}),
        userId,
        rawKey,
        sessionTokenHash,
      },
      window.location.origin,
    );
  });
}

export function isFirefoxExtensionId(value: string | null): value is string {
  return !!value && value === FIREFOX_EXTENSION_ID;
}

export function isExtensionPairingAttempt(value: string | null): value is string {
  return !!value && EXTENSION_PAIRING_ATTEMPT_PATTERN.test(value);
}

export async function sendEncryptionKeyToExtension({
  extensionId,
  pairingAttempt,
  userId,
  rawKey,
  sessionTokenHash,
}: {
  extensionId: string;
  pairingAttempt?: string;
  userId: string;
  rawKey: string;
  sessionTokenHash: string;
}): Promise<void> {
  if (!isFirefoxExtensionId(extensionId)) {
    throw new Error("The Firefox extension ID is invalid.");
  }

  if (!pairingAttempt || !isExtensionPairingAttempt(pairingAttempt)) {
    throw new Error("Open a new connection from the Firefox extension.");
  }
  await sendEncryptionKeyThroughPageBridge({ extensionId, pairingAttempt, userId, rawKey, sessionTokenHash });
}
