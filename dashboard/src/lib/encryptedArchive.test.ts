// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildFavLockExport, type ExportSourceData } from "./dataExport";
import {
  ENCRYPTED_ARCHIVE_FORMAT,
  decryptFavLockArchive,
  encryptFavLockArchive,
  parseEncryptedFavLockArchiveFile,
  serializeEncryptedFavLockArchive,
} from "./encryptedArchive";
import { importRawKey } from "./encryption";

const emptySource: ExportSourceData = {
  bookmarks: [],
  lists: [],
  folders: [],
  tags: [],
  notes: [],
  todos: [],
  readspace: [],
};
const selection = {
  bookmarks: true,
  notes: true,
  todos: true,
  readspace: true,
};

describe("encrypted FavLock archives", () => {
  it("round-trips an export using the account recovery key", async () => {
    const source = buildFavLockExport(
      emptySource,
      selection,
      new Date("2026-08-25T09:00:00.000Z"),
    );
    const recoveryKey = await importRawKey("ABCD1234EFGH5678IJKL9012MNOP3456");
    const encrypted = await encryptFavLockArchive(source, recoveryKey);

    expect(encrypted).toMatchObject({
      format: ENCRYPTED_ARCHIVE_FORMAT,
      version: 2,
      encryption: { algorithm: "AES-GCM", keyLength: 256, tagLength: 128 },
      key: { type: "favlock-recovery-key" },
    });
    expect(JSON.stringify(encrypted)).not.toContain("exportedAt");
    await expect(decryptFavLockArchive(encrypted, recoveryKey)).resolves.toEqual(
      source,
    );
  });

  it("rejects an incorrect recovery key and modified ciphertext", async () => {
    const recoveryKey = await importRawKey("ABCD1234EFGH5678IJKL9012MNOP3456");
    const incorrectKey = await importRawKey("ZYXW9876VUTS5432RQPO1098NMLK7654");
    const encrypted = await encryptFavLockArchive(
      buildFavLockExport(emptySource, selection),
      recoveryKey,
    );

    await expect(decryptFavLockArchive(encrypted, incorrectKey)).rejects.toThrow(
      "recovery key may be incorrect",
    );

    const modified = structuredClone(encrypted);
    modified.payload.ciphertext = `${modified.payload.ciphertext.slice(0, -4)}AAAA`;
    await expect(
      decryptFavLockArchive(modified, recoveryKey),
    ).rejects.toThrow("recovery key may be incorrect");
  });

  it("rejects unsupported archive parameters", async () => {
    const recoveryKey = await importRawKey("ABCD1234EFGH5678IJKL9012MNOP3456");
    const encrypted = await encryptFavLockArchive(
      buildFavLockExport(emptySource, selection),
      recoveryKey,
    );
    await expect(
      decryptFavLockArchive(
        {
          ...encrypted,
          key: { type: "password" },
        },
        recoveryKey,
      ),
    ).rejects.toThrow("unsupported");
  });

  it("serializes the envelope and rejects malformed files", async () => {
    const recoveryKey = await importRawKey("ABCD1234EFGH5678IJKL9012MNOP3456");
    const encrypted = await encryptFavLockArchive(
      buildFavLockExport(emptySource, selection),
      recoveryKey,
    );
    expect(
      parseEncryptedFavLockArchiveFile(
        serializeEncryptedFavLockArchive(encrypted),
      ),
    ).toEqual(encrypted);
    expect(() => parseEncryptedFavLockArchiveFile("not JSON")).toThrow(
      "not a valid FavLock archive",
    );
  });
});
