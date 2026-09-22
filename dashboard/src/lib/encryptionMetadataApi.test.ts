import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./favLockAuth", () => import("../test/requestSessionAuthMock"));
import {
  fetchCachedEncryptionVerifier,
  fetchEncryptionVerifier,
  fetchPasskeyEncryptionRecord,
  saveEncryptionVerifier,
  savePasskeyEncryptionMetadata,
} from "./encryptionMetadataApi";
import { queryClient } from "./queryClient";

const verifier = "enc:YWJjZA==";
const record = {
  credentialId: "credential_id-123",
  prfSalt: "A".repeat(43),
  wrappedKey: "B".repeat(80),
};

afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("encryption metadata API client", () => {
  it("reuses verifier reads for account refreshes while keeping unlock checks fresh", async () => {
    const updatedVerifier = "enc:ZWZnaA==";
    const fetchMock = vi.fn().mockImplementation((_url, options: RequestInit) =>
      Promise.resolve(options.method === "PUT"
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ data: { verifier } }), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCachedEncryptionVerifier("current.jwt.token", "user-a")).resolves.toBe(verifier);
    await expect(fetchCachedEncryptionVerifier("current.jwt.token", "user-a")).resolves.toBe(verifier);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(fetchEncryptionVerifier("current.jwt.token")).resolves.toBe(verifier);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await saveEncryptionVerifier("current.jwt.token", updatedVerifier, "user-a");
    await expect(fetchCachedEncryptionVerifier("current.jwt.token", "user-a"))
      .resolves.toBe(updatedVerifier);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await expect(fetchCachedEncryptionVerifier("current.jwt.token", "user-b")).resolves.toBe(verifier);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("caches an account without a verifier", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { verifier: null } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCachedEncryptionVerifier("current.jwt.token", "user-a")).resolves.toBeNull();
    await expect(fetchCachedEncryptionVerifier("current.jwt.token", "user-a")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous cached verifier when a save fails", async () => {
    const fetchMock = vi.fn().mockImplementation((_url, options: RequestInit) =>
      Promise.resolve(options.method === "PUT"
        ? new Response(JSON.stringify({ error: { code: "service_unavailable" } }), { status: 503 })
        : new Response(JSON.stringify({ data: { verifier } }), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchCachedEncryptionVerifier("current.jwt.token", "user-a");
    await expect(saveEncryptionVerifier("current.jwt.token", "enc:ZWZnaA==", "user-a"))
      .rejects.toThrow("could not access your encryption verifier");
    await expect(fetchCachedEncryptionVerifier("current.jwt.token", "user-a"))
      .resolves.toBe(verifier);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not let an older read replace a saved verifier", async () => {
    let finishRead!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => { finishRead = resolve; });
    const fetchMock = vi.fn().mockImplementation((_url, options: RequestInit) =>
      options.method === "PUT"
        ? Promise.resolve(new Response(null, { status: 204 }))
        : pendingResponse,
    );
    vi.stubGlobal("fetch", fetchMock);

    const olderRead = fetchCachedEncryptionVerifier("current.jwt.token", "user-a");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await saveEncryptionVerifier("current.jwt.token", "enc:ZWZnaA==", "user-a");
    finishRead(new Response(JSON.stringify({ data: { verifier } }), { status: 200 }));
    await olderRead.catch(() => undefined);

    await expect(fetchCachedEncryptionVerifier("current.jwt.token", "user-a"))
      .resolves.toBe("enc:ZWZnaA==");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

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
      saveEncryptionVerifier("current.jwt.token", verifier, "user-a"),
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
      saveEncryptionVerifier("current.jwt.token", verifier, "user-a"),
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
