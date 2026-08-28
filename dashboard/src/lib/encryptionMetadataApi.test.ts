import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./favLockAuth", () => import("../test/requestSessionAuthMock"));
import {
  fetchEncryptionVerifier,
  fetchPasskeyEncryptionRecord,
  saveEncryptionVerifier,
  savePasskeyEncryptionMetadata,
} from "./encryptionMetadataApi";

const verifier = "enc:YWJjZA==";
const record = {
  credentialId: "credential_id-123",
  prfSalt: "A".repeat(43),
  wrappedKey: "B".repeat(80),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("encryption metadata API client", () => {
  it("loads the opaque verifier through the FavLock API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { verifier } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEncryptionVerifier("current.jwt.token")).resolves.toBe(
      verifier,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/account/encryption/verifier",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer current.jwt.token",
        }),
        credentials: "omit",
      }),
    );
  });

  it("preserves a missing verifier", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { verifier: null } }), {
          status: 200,
        }),
      ),
    );

    await expect(fetchEncryptionVerifier("current.jwt.token")).resolves.toBeNull();
  });

  it("stores a verifier with PUT and no response body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveEncryptionVerifier("current.jwt.token", verifier),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/account/encryption/verifier",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          Authorization: "Bearer current.jwt.token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ verifier }),
      }),
    );
  });

  it("loads and stores the established passkey wrapping fields", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: record }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchPasskeyEncryptionRecord("current.jwt.token"),
    ).resolves.toEqual(record);
    await expect(
      savePasskeyEncryptionMetadata("current.jwt.token", record),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.favlock.example/v1/account/encryption/passkey",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(record),
      }),
    );
  });

  it.each([
    { data: { verifier: "plaintext" } },
    { data: { ...record, prfSalt: "short" } },
    { data: { ...record, wrappedKey: "not+base64url" } },
  ])("fails closed for malformed metadata %#", async (payload) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      ),
    );

    if ("verifier" in payload.data) {
      await expect(
        fetchEncryptionVerifier("current.jwt.token"),
      ).rejects.toThrow("could not access your encryption verifier");
    } else {
      await expect(
        fetchPasskeyEncryptionRecord("current.jwt.token"),
      ).rejects.toThrow("could not load your passkey encryption record");
    }
  });

  it("rejects malformed outgoing metadata without a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      savePasskeyEncryptionMetadata("current.jwt.token", {
        ...record,
        prfSalt: "short",
      }),
    ).rejects.toThrow("could not save your passkey encryption record");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not accept an unexpected successful response contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: true }), { status: 200 }),
      ),
    );

    await expect(
      saveEncryptionVerifier("current.jwt.token", verifier),
    ).rejects.toThrow("could not access your encryption verifier");
  });

  it("does not expose upstream error details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "service_unavailable",
              message: "Internal passkey_wrapped_key table detail",
            },
          }),
          { status: 503 },
        ),
      ),
    );

    await expect(
      fetchPasskeyEncryptionRecord("current.jwt.token"),
    ).rejects.toThrow("could not load your passkey encryption record");
  });
});
