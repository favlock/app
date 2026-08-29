const PAIR_REQUEST_TYPE = "favlock.extension.pair-request";
const PAIR_RESPONSE_TYPE = "favlock.extension.pair-response";
const PAIR_KEY_MESSAGE = "favlock.extension.pair-key";

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;

  const request = event.data;
  if (
    request?.type !== PAIR_REQUEST_TYPE ||
    request.extensionId !== chrome.runtime.id ||
    typeof request.requestId !== "string" ||
    (request.pairingAttempt !== undefined &&
      typeof request.pairingAttempt !== "string") ||
    typeof request.userId !== "string" ||
    typeof request.rawKey !== "string" ||
    (request.sessionTokenHash !== undefined &&
      typeof request.sessionTokenHash !== "string")
  ) {
    return;
  }

  void chrome.runtime
    .sendMessage({
      type: PAIR_KEY_MESSAGE,
      ...(request.pairingAttempt
        ? { pairingAttempt: request.pairingAttempt }
        : {}),
      userId: request.userId,
      rawKey: request.rawKey,
      ...(request.sessionTokenHash
        ? { sessionTokenHash: request.sessionTokenHash }
        : {}),
    })
    .then((response) => {
      window.postMessage(
        {
          type: PAIR_RESPONSE_TYPE,
          requestId: request.requestId,
          ok: response?.ok === true,
          error: response?.error,
        },
        event.origin,
      );
    })
    .catch((error) => {
      window.postMessage(
        {
          type: PAIR_RESPONSE_TYPE,
          requestId: request.requestId,
          ok: false,
          error:
            error instanceof Error ? error.message : "Extension pairing failed.",
        },
        event.origin,
      );
    });
});
