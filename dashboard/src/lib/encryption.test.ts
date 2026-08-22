import { describe, expect, it } from "vitest";
import {
  decryptField,
  decryptFieldStrict,
  encryptField,
  formatEncryptionKey,
  generateEncryptionKey,
  importRawKey,
  normalizeRawKey,
  VERIFY_CONSTANT,
} from "./encryption";

describe("encryption helpers", () => {
  it("generates a formatted 32-character key", () => {
    expect(generateEncryptionKey()).toMatch(
      /^[A-Za-z0-9]{4}(?: [A-Za-z0-9]{4}){7}$/,
    );
  });

  it("formats an exported raw key for display", () => {
    expect(formatEncryptionKey("12345678901234567890123456789012")).toBe(
      "1234 5678 9012 3456 7890 1234 5678 9012",
    );
  });

  it("normalizes uploaded key file contents", () => {
    expect(
      normalizeRawKey(
        "\uFEFFEncryption key:\n1234 5678 9012 3456 7890 1234 5678 9012\n",
      ),
    ).toBe("12345678901234567890123456789012");
  });

  it("rejects uploaded contents without a complete key", () => {
    expect(() => normalizeRawKey("not a key")).toThrow(
      "Encryption key must be 32 letters or numbers.",
    );
  });

  it("round-trips encrypted fields with the imported key", async () => {
    const key = await importRawKey("12345678901234567890123456789012");

    const encrypted = await encryptField("https://example.com/path", key);
    expect(encrypted).toMatch(/^enc:/);
    await expect(decryptField(encrypted, key)).resolves.toBe(
      "https://example.com/path",
    );
  });

  it("keeps plaintext values unchanged when decrypting", async () => {
    const key = await importRawKey("12345678901234567890123456789012");

    await expect(decryptField("plain title", key)).resolves.toBe("plain title");
  });

  it("throws in strict mode when the verifier is decrypted with the wrong key", async () => {
    const key = await importRawKey("12345678901234567890123456789012");
    const wrongKey = await importRawKey("abcdefghijklmnopqrstuvwxyzabcdef");
    const verifier = await encryptField(VERIFY_CONSTANT, key);

    await expect(decryptFieldStrict(verifier, wrongKey)).rejects.toThrow();
  });
});
