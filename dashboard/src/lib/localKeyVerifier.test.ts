import { beforeEach, describe, expect, it } from "vitest";
import { importRawKey } from "./encryption";
import { createLocalKeyVerifier, saveLocalKeyVerifier, matchesLocalKey, readLocalKeyVerifier, clearLocalKeyVerifier } from "./localKeyVerifier";

beforeEach(() => localStorage.clear());

describe("local key verifier", () => {
  it("validates the saved key locally, scoped to the exact account", async () => {
    const key = await importRawKey("a".repeat(32));
    const verifier = await createLocalKeyVerifier(key);
    saveLocalKeyVerifier("account-a", verifier);
    expect(verifier.startsWith("enc:")).toBe(true);
    expect(verifier).not.toContain("a".repeat(32));
    await expect(matchesLocalKey("account-a", key)).resolves.toBe(true);
    await expect(matchesLocalKey("account-b", key)).resolves.toBe(false);
    await expect(matchesLocalKey("account-a", await importRawKey("b".repeat(32)))).resolves.toBe(false);
    clearLocalKeyVerifier("account-a");
    expect(readLocalKeyVerifier("account-a")).toBeNull();
  });

  it("rejects plaintext or malformed verifier records", async () => {
    const key = await importRawKey("a".repeat(32));
    saveLocalKeyVerifier("account", "zk-verify-v1");
    await expect(matchesLocalKey("account", key)).resolves.toBe(false);
    saveLocalKeyVerifier("account", "enc:invalid");
    await expect(matchesLocalKey("account", key)).resolves.toBe(false);
  });
});
