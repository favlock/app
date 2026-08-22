import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPasskeyEncryptionRecord,
  unwrapEncryptionKeyWithPasskey,
} from "./passkeyEncryption";

const TEST_KEY = "1234 5678 9012 3456 7890 1234 5678 9012";

class TestPublicKeyCredential {
  rawId: ArrayBuffer;
  private readonly prfResult: ArrayBuffer;

  constructor(rawId: Uint8Array, prfResult: Uint8Array) {
    this.rawId = new Uint8Array(rawId).buffer;
    this.prfResult = new Uint8Array(prfResult).buffer;
  }

  getClientExtensionResults(): {
    prf: {
      enabled: boolean;
      results?: { first: ArrayBuffer };
    };
  } {
    return {
      prf: {
        enabled: true,
        results: { first: this.prfResult },
      },
    };
  }
}

class UnsupportedPrfCredential extends TestPublicKeyCredential {
  getClientExtensionResults() {
    return { prf: { enabled: false } };
  }
}

describe("passkey encryption", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wraps and reuses the encryption key with the same passkey PRF", async () => {
    const credentialId = new Uint8Array([1, 2, 3, 4]);
    const prfResult = crypto.getRandomValues(new Uint8Array(32));
    const create = vi
      .fn()
      .mockResolvedValue(
        new TestPublicKeyCredential(credentialId, prfResult),
      );
    const get = vi
      .fn()
      .mockResolvedValue(
        new TestPublicKeyCredential(credentialId, prfResult),
      );

    vi.stubGlobal(
      "PublicKeyCredential",
      TestPublicKeyCredential as unknown as typeof PublicKeyCredential,
    );
    vi.stubGlobal("navigator", { credentials: { create, get } });

    const record = await createPasskeyEncryptionRecord({
      rawKey: TEST_KEY,
      userId: "test-user",
      userName: "test@example.com",
      displayName: "Test User",
    });

    await expect(
      unwrapEncryptionKeyWithPasskey(record, "test-user"),
    ).resolves.toBe(TEST_KEY);
    expect(create).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledOnce();
  });

  it("rejects a different passkey PRF result", async () => {
    const credentialId = new Uint8Array([1, 2, 3, 4]);
    const createPrf = crypto.getRandomValues(new Uint8Array(32));
    const differentPrf = crypto.getRandomValues(new Uint8Array(32));
    const create = vi
      .fn()
      .mockResolvedValue(
        new TestPublicKeyCredential(credentialId, createPrf),
      );
    const get = vi
      .fn()
      .mockResolvedValue(
        new TestPublicKeyCredential(credentialId, differentPrf),
      );

    vi.stubGlobal(
      "PublicKeyCredential",
      TestPublicKeyCredential as unknown as typeof PublicKeyCredential,
    );
    vi.stubGlobal("navigator", { credentials: { create, get } });

    const record = await createPasskeyEncryptionRecord({
      rawKey: TEST_KEY,
      userId: "test-user",
      userName: "test@example.com",
      displayName: "Test User",
    });

    await expect(
      unwrapEncryptionKeyWithPasskey(record, "test-user"),
    ).rejects.toThrow("does not match");
  });

  it("rejects a passkey provider without PRF support", async () => {
    const credentialId = new Uint8Array([1, 2, 3, 4]);
    const prfResult = crypto.getRandomValues(new Uint8Array(32));
    const create = vi
      .fn()
      .mockResolvedValue(
        new UnsupportedPrfCredential(credentialId, prfResult),
      );
    const get = vi.fn();

    vi.stubGlobal(
      "PublicKeyCredential",
      UnsupportedPrfCredential as unknown as typeof PublicKeyCredential,
    );
    vi.stubGlobal("navigator", { credentials: { create, get } });

    await expect(
      createPasskeyEncryptionRecord({
        rawKey: TEST_KEY,
        userId: "test-user",
        userName: "test@example.com",
        displayName: "Test User",
      }),
    ).rejects.toThrow("does not support encrypted-key protection");
    expect(get).not.toHaveBeenCalled();
  });
});
