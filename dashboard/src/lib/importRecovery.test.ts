import { beforeEach, describe, expect, it } from "vitest";
import { importRawKey } from "./encryption";
import {
  clearImportRecoveryJournal,
  createImportRecoveryJournal,
  getImportItemState,
  readImportRecoveryJournal,
  saveImportRecoveryJournal,
  setImportItemState,
  summarizeImportRecovery,
} from "./importRecovery";

describe("encrypted bookmark import recovery", () => {
  beforeEach(() => localStorage.clear());

  it("stores account-scoped progress as ciphertext and restores it after reload", async () => {
    const key = await importRawKey("abcd efgh ijkl mnop qrst uvwx yzAB CDEF");
    let journal = createImportRecoveryJournal(
      "user-1",
      "a".repeat(64),
      "html",
      3,
    );
    journal = setImportItemState(journal, 0, "added");
    journal = setImportItemState(journal, 1, "duplicate");
    journal = setImportItemState(journal, 2, "invalid");
    journal = {
      ...journal,
      inFlight: [],
    };

    await saveImportRecoveryJournal(journal, key);

    const stored = localStorage.getItem(
      "favlock:bookmark-import-recovery:v1:user-1",
    );
    expect(stored).toMatch(/^enc:/);
    expect(stored).not.toContain("user-1");
    const restored = await readImportRecoveryJournal("user-1", key);
    expect(restored).toMatchObject({
      sourceFingerprint: "a".repeat(64),
      states: "adi",
    });
    expect(getImportItemState(restored!, 0)).toBe("added");
    expect(summarizeImportRecovery(restored!)).toEqual({
      added: 1,
      duplicate: 1,
      overwritten: 0,
      invalid: 1,
      failed: 0,
      unknown: 0,
      remaining: 0,
    });
  });

  it("does not expose another account's recovery record", async () => {
    const key = await importRawKey("abcd efgh ijkl mnop qrst uvwx yzAB CDEF");
    await saveImportRecoveryJournal(
      createImportRecoveryJournal("user-1", "b".repeat(64), "chrome", 1),
      key,
    );

    await expect(readImportRecoveryJournal("user-2", key)).resolves.toBeNull();
  });

  it("clears recovery data on completion or account cleanup", async () => {
    const key = await importRawKey("abcd efgh ijkl mnop qrst uvwx yzAB CDEF");
    await saveImportRecoveryJournal(
      createImportRecoveryJournal("user-1", "c".repeat(64), "safari-zip", 1),
      key,
    );
    clearImportRecoveryJournal("user-1");

    await expect(readImportRecoveryJournal("user-1", key)).resolves.toBeNull();
  });

  it("does not checkpoint late work after the account lease changes", async () => {
    const key = await importRawKey("abcd efgh ijkl mnop qrst uvwx yzAB CDEF");
    const journal = createImportRecoveryJournal(
      "user-1",
      "d".repeat(64),
      "html",
      1,
    );
    let checks = 0;

    await expect(
      saveImportRecoveryJournal(journal, key, () => {
        checks += 1;
        if (checks > 1) throw new Error("account changed");
      }),
    ).rejects.toThrow("account changed");
    expect(localStorage.getItem("favlock:bookmark-import-recovery:v1:user-1"))
      .toBeNull();
  });
});
