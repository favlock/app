export const OFFLINE_WRITE_MESSAGE =
  "You're offline. Reconnect before making changes.";

export function isBrowserOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

export function assertOnline(): void {
  if (!isBrowserOnline()) throw new Error(OFFLINE_WRITE_MESSAGE);
}
