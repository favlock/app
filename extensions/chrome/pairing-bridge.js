const PAIR_REQUEST_TYPE = "favlock.extension.pair-request";
const PAIR_RESPONSE_TYPE = "favlock.extension.pair-response";
const PAIR_KEY_MESSAGE = "favlock.extension.pair-key";
const PROJECTION_REQUEST_TYPE = "favlock.extension.local-projection-request";
const PROJECTION_RESPONSE_TYPE = "favlock.extension.local-projection-response";
const PROJECTION_MESSAGE = "favlock.extension.local-projection";

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;

  const request = event.data;
  if (
    ![PAIR_REQUEST_TYPE, PROJECTION_REQUEST_TYPE].includes(request?.type) ||
    request.extensionId !== chrome.runtime.id ||
    typeof request.requestId !== "string" ||
    typeof request.userId !== "string" ||
    (request.type === PROJECTION_REQUEST_TYPE &&
      (!request.projection || typeof request.projection !== "object")) ||
    (request.type === PAIR_REQUEST_TYPE && (
    (request.pairingAttempt !== undefined &&
      typeof request.pairingAttempt !== "string") ||
    typeof request.rawKey !== "string" ||
    (request.localMode !== undefined && typeof request.localMode !== "boolean") ||
    (request.localProjection !== undefined &&
      typeof request.localProjection !== "object") ||
    (request.sessionTokenHash !== undefined &&
      typeof request.sessionTokenHash !== "string")))
  ) {
    return;
  }

  void chrome.runtime
    .sendMessage({
      type: request.type === PROJECTION_REQUEST_TYPE
        ? PROJECTION_MESSAGE
        : PAIR_KEY_MESSAGE,
      ...(request.type === PROJECTION_REQUEST_TYPE
        ? { projection: request.projection }
        : {}),
      ...(request.pairingAttempt
        ? { pairingAttempt: request.pairingAttempt }
        : {}),
      userId: request.userId,
      rawKey: request.rawKey,
      ...(request.localMode === true ? { localMode: true } : {}),
      ...(request.localProjection ? { localProjection: request.localProjection } : {}),
      ...(request.sessionTokenHash
        ? { sessionTokenHash: request.sessionTokenHash }
        : {}),
    })
    .then((response) => {
      window.postMessage(
        {
          type: PAIR_RESPONSE_TYPE,
          ...(request.type === PROJECTION_REQUEST_TYPE
            ? { type: PROJECTION_RESPONSE_TYPE }
            : {}),
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
          ...(request.type === PROJECTION_REQUEST_TYPE
            ? { type: PROJECTION_RESPONSE_TYPE }
            : {}),
          requestId: request.requestId,
          ok: false,
          error:
            error instanceof Error ? error.message : "Extension pairing failed.",
        },
        event.origin,
      );
    });
});
