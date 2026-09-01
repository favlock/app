import { spawnSync } from "node:child_process";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  configureChromeExtension,
  PRODUCTION_DASHBOARD_URL,
} from "./configure-chrome-extension.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const extensionRoot = resolve(repositoryRoot, "extensions/chrome");
const outputDirectory = resolve(repositoryRoot, "dist/extensions/chrome");
const productionRoot = resolve(outputDirectory, "production");

const packagedFiles = [
  "background.js",
  "bookmark-import-bridge.html",
  "bookmark-import-bridge.js",
  "config.generated.js",
  "config.js",
  "extension-auth.js",
  "extension-crypto.js",
  "extension-data.js",
  "extension-permissions.js",
  "extension-settings.js",
  "icons/favlock-16.png",
  "icons/favlock-32.png",
  "icons/favlock-48.png",
  "icons/favlock-128.png",
  "manifest.json",
  "favlock-logo.svg",
  "options.html",
  "options.js",
  "pairing-bridge.js",
  "popup.css",
  "popup.html",
  "popup.js",
  "reader-extractor.js",
  "reader.css",
  "reader.html",
  "reader.js",
  "styles.css",
].sort();

function runCommand(command, args, options = {}) {
  const { capture = false, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    ...spawnOptions,
  });

  if (result.error?.code === "ENOENT") {
    throw new Error(
      `${command} is required to package the Chrome extension but was not found.`,
    );
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = capture
      ? `\n${result.stderr || result.stdout || ""}`
      : "";
    throw new Error(`${command} exited with status ${result.status}.${details}`);
  }

  return result.stdout || "";
}

await configureChromeExtension({ target: "development" });
runCommand("npm", ["run", "test:chrome"]);
await configureChromeExtension({ target: "development" });

const manifest = JSON.parse(
  await readFile(resolve(extensionRoot, "manifest.json"), "utf8"),
);
if (manifest.manifest_version !== 3) {
  throw new Error("The Chrome extension package must use Manifest V3.");
}
if (typeof manifest.version !== "string" || !manifest.version.trim()) {
  throw new Error("The Chrome extension manifest version is missing.");
}

for (const file of packagedFiles) {
  await access(resolve(extensionRoot, file));
}

await rm(productionRoot, { recursive: true, force: true });
await mkdir(productionRoot, { recursive: true });

for (const file of packagedFiles) {
  if (["config.generated.js", "manifest.json"].includes(file)) continue;
  const destination = resolve(productionRoot, file);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(extensionRoot, file), destination);
}

const productionMatch = `${new URL(PRODUCTION_DASHBOARD_URL).origin}/*`;
const productionConfig = await configureChromeExtension({
  target: "production",
  outputPath: resolve(productionRoot, "config.generated.js"),
});
const apiOrigin = new URL(productionConfig.apiUrl).origin;
const productionManifest = {
  ...manifest,
  host_permissions: [`${apiOrigin}/*`],
  content_security_policy: {
    extension_pages:
      `script-src 'self'; object-src 'self'; connect-src ${apiOrigin}`,
  },
  externally_connectable: {
    ...manifest.externally_connectable,
    matches: [productionMatch],
  },
  content_scripts: manifest.content_scripts.map((contentScript) =>
    contentScript.js?.includes("pairing-bridge.js")
      ? { ...contentScript, matches: [productionMatch] }
      : contentScript,
  ),
};
await writeFile(
  resolve(productionRoot, "manifest.json"),
  `${JSON.stringify(productionManifest, null, 2)}\n`,
  "utf8",
);

for (const file of packagedFiles) {
  if (file.endsWith(".js")) {
    runCommand(process.execPath, ["--check", resolve(productionRoot, file)], {
      capture: true,
    });
  }
}

const outputPath = resolve(
  outputDirectory,
  `favlock-chrome-extension-v${manifest.version}.zip`,
);
await rm(outputPath, { force: true });

runCommand("zip", ["-X", "-q", outputPath, ...packagedFiles], {
  cwd: productionRoot,
});
runCommand("unzip", ["-tq", outputPath], { capture: true });

const archivedFiles = runCommand("unzip", ["-Z1", outputPath], {
  capture: true,
})
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter((file) => file && !file.endsWith("/"))
  .sort();

if (JSON.stringify(archivedFiles) !== JSON.stringify(packagedFiles)) {
  throw new Error("The generated ZIP contents do not match the runtime allowlist.");
}

const { size } = await stat(outputPath);
await rm(productionRoot, { recursive: true, force: true });
console.log(
  `Created ${outputPath} (${packagedFiles.length} files, ${(size / 1024).toFixed(1)} KiB).`,
);
