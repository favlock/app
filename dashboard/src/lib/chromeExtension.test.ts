import { describe, expect, it, vi } from "vitest";
import {
  checkChromeExtensionOnboardingStatus,
  isGoogleChrome,
  supportsFavLockChromeExtension,
} from "./chromeExtension";

describe("Chrome extension browser detection", () => {
  it("recognizes desktop Google Chrome", () => {
    expect(
      isGoogleChrome(
        "Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
        "Google Inc.",
      ),
    ).toBe(true);
  });

  it("excludes other Chromium browsers and non-Google vendors", () => {
    expect(
      isGoogleChrome(
        "Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
        "Google Inc.",
      ),
    ).toBe(false);
    expect(
      isGoogleChrome(
        "Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
        "Apple Computer, Inc.",
      ),
    ).toBe(false);
  });

  it("offers the extension only on supported desktop Chrome", () => {
    expect(
      supportsFavLockChromeExtension(
        "Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
        "Google Inc.",
      ),
    ).toBe(true);
    expect(
      supportsFavLockChromeExtension(
        "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36",
        "Google Inc.",
      ),
    ).toBe(false);
  });

  it.each([
    [{ ok: true, connected: false }, "installed-unpaired"],
    [
      { ok: true, connected: true, accountMatches: false, unlocked: true },
      "installed-wrong-account",
    ],
    [
      { ok: true, connected: true, accountMatches: true, unlocked: false },
      "installed-locked",
    ],
    [
      { ok: true, connected: true, accountMatches: true, unlocked: true },
      "paired",
    ],
  ] as const)("maps an installed extension response to %s", async (response, expected) => {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn((_id, _message, callback) => callback(response)),
      },
    });

    await expect(
      checkChromeExtensionOnboardingStatus({
        extensionId: "a".repeat(32),
        userId: "11111111-1111-4111-8111-111111111111",
      }),
    ).resolves.toBe(expected);
    vi.unstubAllGlobals();
  });

  it("does not treat an extension ID as installation proof", async () => {
    vi.stubGlobal("chrome", undefined);
    await expect(
      checkChromeExtensionOnboardingStatus({
        extensionId: "a".repeat(32),
        userId: "11111111-1111-4111-8111-111111111111",
      }),
    ).resolves.toBe("not-installed");
    vi.unstubAllGlobals();
  });
});
