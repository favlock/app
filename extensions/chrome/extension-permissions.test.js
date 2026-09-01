import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  hasChromeBookmarkPermission,
  requestChromeBookmarkPermission,
} from "./extension-permissions.js";

describe("optional Chrome bookmark permission", () => {
  it("keeps bookmark-tree access out of install-time permissions", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("./manifest.json", import.meta.url), "utf8"),
    );

    expect(manifest.permissions).not.toContain("bookmarks");
    expect(manifest.optional_permissions).toContain("bookmarks");
  });

  it("requests bookmark access only for the import action", async () => {
    const request = vi.fn(async () => true);

    await expect(
      requestChromeBookmarkPermission({ request }),
    ).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({ permissions: ["bookmarks"] });
  });

  it("reports when bookmark access has not been granted", async () => {
    const contains = vi.fn(async () => false);

    await expect(
      hasChromeBookmarkPermission({ contains }),
    ).resolves.toBe(false);
    expect(contains).toHaveBeenCalledWith({ permissions: ["bookmarks"] });
  });
});
