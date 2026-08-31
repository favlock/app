import { describe, expect, it } from "vitest";
import { withBrowserBookmarkImportLock } from "./browserBookmarkImportLock";

describe("bookmark import browser lock", () => {
  it("rejects a competing attempt for the same account", async () => {
    let release!: () => void;
    const first = withBrowserBookmarkImportLock(
      "user-1",
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    await Promise.resolve();

    await expect(
      withBrowserBookmarkImportLock("user-1", async () => undefined),
    ).rejects.toThrow("Another bookmark import is already running");
    release();
    await first;
  });

  it("does not block another account", async () => {
    await expect(
      Promise.all([
        withBrowserBookmarkImportLock("user-1", async () => "one"),
        withBrowserBookmarkImportLock("user-2", async () => "two"),
      ]),
    ).resolves.toEqual(["one", "two"]);
  });
});
