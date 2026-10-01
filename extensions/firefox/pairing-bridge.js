const PAIR_REQUEST_TYPE = "favlock.firefox.pair-request";
const PAIR_RESPONSE_TYPE = "favlock.firefox.pair-response";
const PAIR_KEY_MESSAGE = "favlock.firefox.pair-key";

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;

  if (window.top !== window) return;
  const request = event.data;
  if (request?.type === "favlock.firefox.installation-request") {
    if (typeof request.requestId !== "string" || !request.requestId || request.requestId.length > 64) return;
    window.postMessage({
      type: "favlock.firefox.installation-response",
      requestId: request.requestId,
      extensionId: browser.runtime.id,
    }, event.origin);
    return;
  }

  if (window.location.pathname !== "/extension/firefox/pair") return;
  if (
    request?.type !== PAIR_REQUEST_TYPE ||
    request.extensionId !== browser.runtime.id ||
    typeof request.requestId !== "string" || request.requestId.length > 64 ||
    !/^[A-Za-z0-9_-]{43}$/.test(request.pairingAttempt ?? "") ||
    typeof request.userId !== "string" ||
    (request.pairingAttempt !== undefined &&
      typeof request.pairingAttempt !== "string") ||
    typeof request.rawKey !== "string" || request.rawKey.length > 128 ||
    typeof request.sessionTokenHash !== "string" ||
    request.sessionTokenHash.length > 4096 ||
    !request.sessionTokenHash
  ) {
    return;
  }

  void browser.runtime
    .sendMessage({
      type: PAIR_KEY_MESSAGE,
      ...(request.pairingAttempt
        ? { pairingAttempt: request.pairingAttempt }
        : {}),
      userId: request.userId,
      rawKey: request.rawKey,
      sessionTokenHash: request.sessionTokenHash,
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
