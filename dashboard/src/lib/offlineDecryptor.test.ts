import { describe, expect, it } from "vitest";
import {
  OFFLINE_DECRYPTOR_FILENAME,
  buildOfflineDecryptorHtml,
} from "./offlineDecryptor";
import { ENCRYPTED_ARCHIVE_FORMAT } from "./encryptedArchive";

describe("FavLock offline decryptor", () => {
  it("builds a self-contained network-blocked HTML tool for the archive contract", () => {
    const html = buildOfflineDecryptorHtml();

    expect(OFFLINE_DECRYPTOR_FILENAME).toBe("favlock-offline-decryptor.html");
    expect(html).toContain('aria-label="FavLock"');
    expect(html).toContain("Offline decryptor");
    expect(html).toContain("Nothing is uploaded.");
    expect(html).toContain('id="recovery-key-file-button"');
    expect(html).toMatch(/id="recovery-key-file"[^>]* hidden/);
    expect(html).not.toContain("FavLock encrypted archive format");
    expect(html).toContain(`const FORMAT = "${ENCRYPTED_ARCHIVE_FORMAT}"`);
    expect(html).toContain('value.key.type !== "favlock-recovery-key"');
    expect(html).toContain("The recovery key must contain 32 letters or numbers.");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain('type="file"');
    expect(html).not.toMatch(/<script\s+src=/i);
    expect(html).not.toMatch(/<link\s+[^>]*href=/i);
    expect(html).not.toMatch(/https?:\/\//i);
  });
});
