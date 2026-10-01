import { afterEach, describe, expect, it, vi } from "vitest";
import { FIREFOX_EXTENSION_ID, isFirefoxExtensionId, sendEncryptionKeyToExtension } from "./firefoxExtensionPairing";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const payload = { extensionId: FIREFOX_EXTENSION_ID, pairingAttempt: "p".repeat(43), userId: "11111111-1111-4111-8111-111111111111", rawKey: "A".repeat(32), sessionTokenHash: "fake-token" };

describe("Firefox dashboard pairing", () => {
  it("accepts only the fixed Firefox ID", () => {
    expect(isFirefoxExtensionId(FIREFOX_EXTENSION_ID)).toBe(true);
    for (const id of ["a".repeat(32), "other@favlock.app", "firefox@favlock.app.evil", null]) expect(isFirefoxExtensionId(id)).toBe(false);
  });
  it("correlates responses by source, origin, request id and Firefox message type", async () => {
    const send = vi.spyOn(window, "postMessage").mockImplementation(() => {});
    const pending = sendEncryptionKeyToExtension(payload);
    const request = send.mock.calls[0][0];
    const reply = { type: "favlock.firefox.pair-response", requestId: request.requestId, ok: true };
    let resolved = false;
    void pending.then(() => { resolved = true; });
    for (const overrides of [{ origin: "https://evil.example" }, { source: null }, { data: { ...reply, requestId: "wrong" } }, { data: { ...reply, type: "favlock.extension.pair-response" } }]) {
      window.dispatchEvent(new MessageEvent("message", { source: window, origin: window.location.origin, data: reply, ...overrides }));
      await Promise.resolve();
      expect(resolved).toBe(false);
    }
    window.dispatchEvent(new MessageEvent("message", { source: window, origin: window.location.origin, data: reply }));
    await expect(pending).resolves.toBeUndefined();
    expect(request.type).toBe("favlock.firefox.pair-request");
    expect(request).not.toHaveProperty("accessToken");
  });
  it("requires a fresh attempt and times out with Firefox recovery instructions", async () => {
    await expect(sendEncryptionKeyToExtension({ ...payload, pairingAttempt: undefined })).rejects.toThrow("new connection");
    vi.useFakeTimers();
    vi.spyOn(window, "postMessage").mockImplementation(() => {});
    const pending = sendEncryptionKeyToExtension(payload);
    const rejected = expect(pending).rejects.toThrow("about:debugging");
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
  });
});
