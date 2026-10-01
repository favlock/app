import { afterEach, describe, expect, it, vi } from "vitest";
import { checkFirefoxExtensionInstallation, supportsFavLockFirefoxExtension } from "./firefoxExtension";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Firefox extension recommendation eligibility", () => {
  it("supports desktop Firefox 142 and newer", () => {
    expect(supportsFavLockFirefoxExtension("Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:142.0) Gecko/20100101 Firefox/142.0")).toBe(true);
  });
  it.each([
    "Mozilla/5.0 Firefox/141.0",
    "Mozilla/5.0 (Android 16; Mobile) Firefox/156.0",
    "Mozilla/5.0 (iPhone) FxiOS/142.0",
    "Mozilla/5.0 Chrome/142.0.0.0 Safari/537.36",
    "Mozilla/5.0 Version/18.0 Safari/605.1.15",
  ])("excludes unsupported browser %s", (userAgent) => {
    expect(supportsFavLockFirefoxExtension(userAgent)).toBe(false);
  });

  it("accepts only a correlated reply from the dashboard page and Firefox extension", async () => {
    const send = vi.spyOn(window, "postMessage").mockImplementation(() => {});
    const pending = checkFirefoxExtensionInstallation();
    const request = send.mock.calls[0][0];
    expect(Object.keys(request).sort()).toEqual(["requestId", "type"]);
    const reply = { type: "favlock.firefox.installation-response", requestId: request.requestId, extensionId: "firefox@favlock.app" };
    let resolved = false;
    void pending.then(() => { resolved = true; });
    for (const overrides of [
      { origin: "https://evil.example" },
      { source: null },
      { data: { ...reply, requestId: "wrong" } },
      { data: { ...reply, extensionId: "other@example.com" } },
      { data: { ...reply, type: "favlock.firefox.pair-response" } },
    ]) {
      window.dispatchEvent(new MessageEvent("message", { source: window, origin: window.location.origin, data: reply, ...overrides }));
      await Promise.resolve();
      expect(resolved).toBe(false);
    }
    window.dispatchEvent(new MessageEvent("message", { source: window, origin: window.location.origin, data: reply }));
    await expect(pending).resolves.toBe("installed");
  });

  it("reports missing installation on timeout and removes the listener", async () => {
    vi.useFakeTimers();
    vi.spyOn(window, "postMessage").mockImplementation(() => {});
    const remove = vi.spyOn(window, "removeEventListener");
    const pending = checkFirefoxExtensionInstallation();
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toBe("not-installed");
    expect(remove).toHaveBeenCalledWith("message", expect.any(Function));
  });
});
