import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAuthenticatedJson,
  putAuthenticatedBlobWithoutResponse,
} from "./authenticatedApi";
import { fetchEncryptedFiles, uploadEncryptedFile } from "./filesApi";

vi.mock("./authenticatedApi", () => ({
  deleteAuthenticatedWithoutResponse: vi.fn(),
  fetchAuthenticatedBlob: vi.fn(),
  fetchAuthenticatedJson: vi.fn(),
  postAuthenticatedJson: vi.fn(),
  putAuthenticatedBlobWithoutResponse: vi.fn(),
}));

const validFile = {
  id: "019d1a27-1ec0-4e01-8a7e-5ca14e699099",
  encryptedMetadata: "enc:metadata",
  wrappedKey: "fwk:2:key",
  ciphertextBytes: 1_048_617,
  formatVersion: 2,
  createdAt: "2026-09-07T08:00:00.000Z",
  updatedAt: "2026-09-07T08:00:01.000Z",
};

describe("encrypted files API", () => {
  beforeEach(() => vi.resetAllMocks());

  it("accepts the bounded provider-neutral list contract", async () => {
    vi.mocked(fetchAuthenticatedJson).mockResolvedValue({
      data: {
        files: [{ ...validFile, objectPath: "must-not-cross-the-boundary" }],
        usage: {
          usedBytes: 1_048_617,
          limitBytes: 52_428_800,
          maxCiphertextBytes: 10_485_945,
        },
      },
    });

    const signal = new AbortController().signal;
    const result = await fetchEncryptedFiles("current.jwt.token", signal);

    expect(result.files).toEqual([validFile]);
    expect(result.files[0]).not.toHaveProperty("objectPath");
    expect(fetchAuthenticatedJson).toHaveBeenCalledWith("/v1/files", "current.jwt.token", expect.any(String), { signal });
  });

  it("rejects ciphertext sizes outside the padded file format", async () => {
    vi.mocked(fetchAuthenticatedJson).mockResolvedValue({
      data: {
        files: [{ ...validFile, ciphertextBytes: 1_048_618 }],
        usage: {
          usedBytes: 1_048_618,
          limitBytes: 52_428_800,
          maxCiphertextBytes: 10_485_945,
        },
      },
    });

    await expect(fetchEncryptedFiles("current.jwt.token"))
      .rejects.toThrow("could not load");
  });

  it("uploads only opaque bytes through the authenticated API boundary", async () => {
    const ciphertext = new Blob([new Uint8Array(1_048_617)], {
      type: "application/octet-stream",
    });

    await uploadEncryptedFile("current.jwt.token", validFile.id, ciphertext);

    expect(putAuthenticatedBlobWithoutResponse).toHaveBeenCalledWith(
      `/v1/files/${validFile.id}/content`,
      "current.jwt.token",
      ciphertext,
      "We could not upload this encrypted file.",
      { timeoutMs: 300_000 },
    );
  });

  it("accepts v2 records and validates the unfinished-upload projection", async () => {
    const pending = { id: validFile.id, ciphertextBytes: 1048617, createdAt: validFile.createdAt };
    vi.mocked(fetchAuthenticatedJson).mockResolvedValue({ data: {
      files: [{ ...validFile, formatVersion: 2 }], pendingFiles: [pending],
      usage: { usedBytes: 2097234, limitBytes: 52428800, maxCiphertextBytes: 10485945 },
    } });
    const result = await fetchEncryptedFiles("current.jwt.token");
    expect(result.files[0]?.formatVersion).toBe(2);
    expect(result.pendingFiles).toEqual([pending]);
  });

  it("rejects v1 records from the server", async () => {
    vi.mocked(fetchAuthenticatedJson).mockResolvedValue({ data: {
      files: [{ ...validFile, formatVersion: 1 }],
      usage: { usedBytes: 1048617, limitBytes: 52428800, maxCiphertextBytes: 10485945 },
    } });
    await expect(fetchEncryptedFiles("current.jwt.token")).rejects.toThrow("could not load");
  });
});
