import { describe, expect, it } from "vitest";
import {
  isAllowedFavLockExtensionId,
  isChromeExtensionId,
  isExtensionPairingAttempt,
} from "./extensionPairing";

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
});
