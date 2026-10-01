import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configure, configuredManifest, matchPattern } from "./scripts/configure.mjs";

describe("independent Firefox configuration", () => {
  it("omits unsupported ports from match patterns while binding CSP to the exact API origin", async () => {
    expect(matchPattern("http://localhost:4180")).toBe("http://localhost/*");
    const manifest = await configuredManifest({ dashboardUrl: "http://localhost:4177/", apiUrl: "http://localhost:4180" });
    expect(manifest.host_permissions).toEqual(["http://localhost/*"]);
    expect(manifest.content_scripts[0].matches).toEqual(["http://localhost/*"]);
    expect(manifest.content_security_policy.extension_pages).toContain("connect-src http://localhost:4180");
  });
  it("builds fixed production config and owns its background, ID, and version", async () => {
    const directory = await mkdtemp(join(tmpdir(), "favlock-firefox-config-"));
    try {
      const config = await configure({ outputDirectory: directory });
      expect(config).toMatchObject({ apiUrl: "https://api.favlock.app", extensionId: "firefox@favlock.app" });
      const manifest = await configuredManifest(config);
      const metadata = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
      expect(manifest.version).toBe(metadata.version);
      expect(manifest.background).toEqual({ scripts: ["background.js"], type: "module" });
      expect(manifest).not.toHaveProperty("externally_connectable");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
