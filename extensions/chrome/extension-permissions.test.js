import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  getHighlightSitePattern,
  hasHighlightSiteAccess,
  hasChromeBookmarkPermission,
  requestHighlightSiteAccess,
  removeGrantedHighlightSiteAccess,
  requestChromeBookmarkPermission,
} from "./extension-permissions.js";

describe("optional Chrome bookmark permission", () => {
  it("keeps bookmark-tree access out of install-time permissions", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("./manifest.json", import.meta.url), "utf8"),
    );

    expect(manifest.permissions).not.toContain("bookmarks");
    expect(manifest.optional_permissions).toContain("bookmarks");
    expect(manifest.host_permissions).not.toContain("<all_urls>");
    expect(manifest.optional_host_permissions).toEqual([
      "http://*/*",
      "https://*/*",
    ]);
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

describe("optional highlight site access", () => {
  it("limits a runtime request to the current website", async () => {
    const request = vi.fn(async () => true);

    expect(getHighlightSitePattern("https://news.example:8443/story?id=1")).toBe(
      "https://news.example:8443/*",
    );
    await expect(
      requestHighlightSiteAccess({ request }, "https://news.example/story"),
    ).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({
      origins: ["https://news.example/*"],
    });
  });

  it("checks access without prompting and rejects non-web pages", async () => {
    const contains = vi.fn(async () => false);

    await expect(
      hasHighlightSiteAccess({ contains }, "http://example.com/article"),
    ).resolves.toBe(false);
    expect(contains).toHaveBeenCalledWith({
      origins: ["http://example.com/*"],
    });
    await expect(
      requestHighlightSiteAccess({ request: vi.fn() }, "chrome://settings"),
    ).resolves.toBe(false);
  });

  it("removes granted websites while preserving required extension origins", async () => {
    const remove = vi.fn(async ({ origins }) => origins[0] !== "https://required.example/*");

    await expect(removeGrantedHighlightSiteAccess(
      {
        getAll: vi.fn(async () => ({
          origins: [
            "https://required.example/*",
            "https://news.example/*",
            "http://local.example/*",
            "chrome://settings/*",
          ],
        })),
        remove,
      },
      ["https://required.example/*"],
    )).resolves.toBe(2);
    expect(remove.mock.calls).toEqual([
      [{ origins: ["https://news.example/*"] }],
      [{ origins: ["http://local.example/*"] }],
    ]);
  });
});
