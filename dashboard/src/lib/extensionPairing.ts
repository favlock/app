const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const EXTENSION_PAIRING_ATTEMPT_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const EXTENSION_PAIR_KEY_MESSAGE = "favlock.extension.pair-key";
const EXTENSION_PAIR_REQUEST_MESSAGE = "favlock.extension.pair-request";
const EXTENSION_PAIR_RESPONSE_MESSAGE = "favlock.extension.pair-response";

export function isAllowedFavLockExtensionId(
  extensionId: string | null,
  configuredExtensionId: string | undefined,
): extensionId is string {
  return (
    isChromeExtensionId(extensionId) &&
    isChromeExtensionId(configuredExtensionId ?? null) &&
    extensionId === configuredExtensionId
  );
}

type ChromeRuntime = {
  lastError?: { message?: string };
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response?: { ok?: boolean; error?: string }) => void,
  ) => void;
};

function getChromeRuntime(): ChromeRuntime | null {
  const chromeGlobal = (
    globalThis as typeof globalThis & {
      chrome?: { runtime?: ChromeRuntime };
    }
  ).chrome;
  return chromeGlobal?.runtime ?? null;
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
          "FavLock could not reach the extension. Reload it in chrome://extensions, then reload this page.",
        ),
      );
    }, 3000);

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
      if (event.data.ok) {
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

export function isChromeExtensionId(value: string | null): value is string {
  return !!value && CHROME_EXTENSION_ID_PATTERN.test(value);
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
  if (!isChromeExtensionId(extensionId)) {
    throw new Error("The Chrome extension ID is invalid.");
  }

  const runtime = getChromeRuntime();
  if (!runtime?.sendMessage) {
    await sendEncryptionKeyThroughPageBridge({
      extensionId,
      pairingAttempt,
      userId,
      rawKey,
      sessionTokenHash,
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    runtime.sendMessage(
      extensionId,
      {
        type: EXTENSION_PAIR_KEY_MESSAGE,
        ...(pairingAttempt ? { pairingAttempt } : {}),
        userId,
        rawKey,
        sessionTokenHash,
      },
      (response) => {
        const runtimeError = runtime.lastError?.message;
        if (runtimeError) {
          reject(new Error(runtimeError));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "The extension rejected the key."));
          return;
        }
        resolve();
      },
    );
  });
}
