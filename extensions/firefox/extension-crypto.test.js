import { describe, expect, it } from "vitest";
import {
  decryptField,
  encryptField,
  importLibraryKey,
  normalizeRawKey,
} from "./extension-crypto.js";

describe("extension encryption", () => {
  it("uses the same AES-GCM field format as the dashboard", async () => {
    const rawKey = "abcd1234efgh5678ijkl9012mnop3456"; // gitleaks:allow -- deterministic test fixture
    const key = await importLibraryKey(rawKey);
    const encrypted = await encryptField("Private collection", key);

    expect(encrypted).toMatch(/^enc:/);
    await expect(decryptField(encrypted, key)).resolves.toBe(
      "Private collection",
    );
  });

  it("normalizes the grouped FavLock key format", () => {
    expect(
      normalizeRawKey("abcd 1234 efgh 5678 ijkl 9012 mnop 3456"),
    ).toBe("abcd1234efgh5678ijkl9012mnop3456");
  });
});
