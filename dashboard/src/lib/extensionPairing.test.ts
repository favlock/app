import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAllowedFavLockExtensionId,
  isChromeExtensionId,
  isExtensionPairingAttempt,
  sendEncryptionKeyToExtension,
  sendLocalProjectionToExtension,
} from "./extensionPairing";

afterEach(() => vi.unstubAllGlobals());

describe("Chrome extension pairing", () => {
  it("accepts Chrome IDs and rejects invalid extension IDs", () => {
    expect(isChromeExtensionId("a".repeat(32))).toBe(true);
    expect(isChromeExtensionId("z".repeat(32))).toBe(false);
  });

  it("accepts only the URL-safe 32-byte pairing attempt", () => {
    expect(isExtensionPairingAttempt("a".repeat(43))).toBe(true);
    expect(isExtensionPairingAttempt("a".repeat(42))).toBe(false);
    expect(isExtensionPairingAttempt(`${"a".repeat(42)}!`)).toBe(false);
  });

  it("allows only the extension ID configured for the environment", () => {
    const configuredId = "a".repeat(32);
    const otherId = "b".repeat(32);
    expect(
      isAllowedFavLockExtensionId(configuredId, configuredId),
    ).toBe(true);
    expect(isAllowedFavLockExtensionId(otherId, configuredId)).toBe(false);
    expect(isAllowedFavLockExtensionId(configuredId, undefined)).toBe(false);
  });

  it("sends ciphertext projections during pairing and later refreshes", async () => {
    const sendMessage = vi.fn((
      _extensionId: string,
      _message: unknown,
      callback: (response: { ok: boolean }) => void,
    ) => callback({ ok: true }));
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    const projection = {
      version: 1 as const,
      userId: "11111111-1111-4111-8111-111111111111",
      revision: "1:test",
      generatedAt: "2026-09-02T10:00:00.000Z",
      folders: [],
      tags: [],
      lists: [],
      bookmarks: [],
    };

    await sendEncryptionKeyToExtension({
      extensionId: "a".repeat(32),
      pairingAttempt: "p".repeat(43),
      userId: projection.userId,
      rawKey: "test-key",
      localMode: true,
      localProjection: projection,
    });
    await sendLocalProjectionToExtension({
      extensionId: "a".repeat(32),
      userId: projection.userId,
      projection: { ...projection, revision: "2:test" },
    });

    expect(sendMessage.mock.calls[0]?.[1]).toMatchObject({
      type: "favlock.extension.pair-key",
      localMode: true,
      localProjection: projection,
    });
    expect(sendMessage.mock.calls[1]?.[1]).toMatchObject({
      type: "favlock.extension.local-projection",
      projection: { revision: "2:test" },
    });
  });
});
