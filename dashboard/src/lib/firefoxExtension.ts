import { FIREFOX_EXTENSION_ID } from "./firefoxExtensionPairing";

export function supportsFavLockFirefoxExtension(userAgent: string): boolean {
  const version = /Firefox\/(\d+)/.exec(userAgent);
  return Boolean(
    version && Number(version[1]) >= 142 &&
    !/(?:Android|Mobile|iPhone|iPad|iPod)\b/i.test(userAgent),
  );
}

export function checkFirefoxExtensionInstallation(
  timeoutMs = 1500,
): Promise<"installed" | "not-installed"> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => finish("not-installed"), timeoutMs);
    function finish(status: "installed" | "not-installed") {
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
      resolve(status);
    }
    function receive(event: MessageEvent) {
      if (
        event.source === window &&
        event.origin === window.location.origin &&
        event.data?.type === "favlock.firefox.installation-response" &&
        event.data?.requestId === requestId &&
        event.data?.extensionId === FIREFOX_EXTENSION_ID
      ) {
        finish("installed");
      }
    }
    window.addEventListener("message", receive);
    window.postMessage({ type: "favlock.firefox.installation-request", requestId }, window.location.origin);
  });
}
