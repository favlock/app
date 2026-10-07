import { spawnSync } from "node:child_process";
import { copyFile, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, posix, resolve } from "node:path";
import { configure, configuredManifest, extensionRoot, EXTENSION_ID } from "./configure.mjs";

// This package owns every runtime file. Never copy from another extension at build time.
export const packagedFiles = [
  "background.js", "bookmark-import.js", "bookmark-usage-queue.js", "bookmark-import-bridge.html", "bookmark-import-bridge.js",
  "config.generated.js", "config.js", "extension-auth.js", "extension-context-menu.js", "extension-crypto.js",
  "extension-data.js", "extension-highlight-status.js", "extension-permissions.js", "extension-settings.js",
  "highlight-page.js", "icons/favlock-16.png", "icons/favlock-32.png", "icons/favlock-48.png", "icons/favlock-128.png",
  "manifest.json", "favlock-logo-dark.svg", "favlock-logo.svg", "options.html", "options.js", "pairing-bridge.js",
  "popup.css", "popup.html", "popup.js", "reader-extractor.js", "reader-content.js", "reader.css", "reader.html", "reader.js", "styles.css",
].sort();

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

const target = process.argv.includes("--development") ? "development" : "production";
const metadata = JSON.parse(await readFile(resolve(extensionRoot, "package.json"), "utf8"));
const lockfile = JSON.parse(await readFile(resolve(extensionRoot, "package-lock.json"), "utf8"));
const sourceManifest = JSON.parse(await readFile(resolve(extensionRoot, "manifest.json"), "utf8"));
if ([sourceManifest.version, lockfile.version, lockfile.packages?.[""]?.version]
  .some((version) => version !== metadata.version)) {
  throw new Error("Firefox manifest, package, and lockfile versions must match.");
}
// Only release metadata is shared. A standalone copy still builds independently.
let appMetadata;
try {
  appMetadata = JSON.parse(await readFile(resolve(extensionRoot, "../../package.json"), "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (appMetadata?.name === "favlock-app" && appMetadata.version !== metadata.version) {
  throw new Error(`Firefox version ${metadata.version} must match app version ${appMetadata.version}.`);
}
const destination = resolve(extensionRoot, "dist", target);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const name of packagedFiles) {
  if (["config.generated.js", "manifest.json"].includes(name)) continue;
  const source = resolve(extensionRoot, name);
  for (const part of [source, dirname(source)]) {
    if ((await lstat(part)).isSymbolicLink()) throw new Error(`Symlinks are forbidden: ${name}`);
  }
  if (/\.(js|html|css)$/.test(name)) {
    const text = await readFile(source, "utf8");
    if (/extensions\/(chrome|safari)|packages\/shared|@favlock\/shared/.test(text)) throw new Error(`Non-independent source: ${name}`);
    const references = name.endsWith(".js")
      ? [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(|\bimport\s+)["']([^"']+)["']/g)].map((match) => match[1])
      : name.endsWith(".html")
        ? [...text.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]).filter((ref) => !ref.startsWith("#") && !/^https:\/\//.test(ref))
        : [];
    for (const reference of references) {
      const resolved = posix.normalize(posix.join(posix.dirname(name), reference));
      if (!packagedFiles.includes(resolved)) throw new Error(`${name} references a file outside this package: ${reference}`);
    }
  }
  await mkdir(dirname(resolve(destination, name)), { recursive: true });
  await copyFile(source, resolve(destination, name));
}
const config = await configure({ target, outputDirectory: destination });
const manifest = await configuredManifest(config);
if (manifest.version !== metadata.version || manifest.manifest_version !== 3 ||
    manifest.browser_specific_settings.gecko.id !== EXTENSION_ID || manifest.background.service_worker ||
    manifest.externally_connectable) throw new Error("Invalid Firefox manifest/version contract.");
await writeFile(resolve(destination, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
for (const name of packagedFiles.filter((file) => file.endsWith(".js"))) run(process.execPath, ["--check", resolve(destination, name)], extensionRoot);
const archive = resolve(extensionRoot, "dist", `favlock-firefox-v${manifest.version}-${target}.zip`);
await rm(archive, { force: true });
run("zip", ["-X", "-q", archive, ...packagedFiles], destination);
run("unzip", ["-tq", archive], extensionRoot);
const entries = run("unzip", ["-Z1", archive], extensionRoot).trim().split("\n").sort();
if (JSON.stringify(entries) !== JSON.stringify(packagedFiles)) throw new Error("Unexpected archive contents.");
console.log(`Created ${archive} (${packagedFiles.length} independent runtime files).`);

// Mozilla reviewers rebuild the add-on from this archive with `npm ci --ignore-scripts && npm run build`.
// A standalone copy, such as the extracted source archive, has no Git metadata and skips this step.
let sourceArchive;
const insideGit = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: extensionRoot, encoding: "utf8" })
  .stdout?.trim() === "true";
if (target === "production" && !insideGit) console.log("Skipped the source archive outside a Git checkout.");
if (target === "production" && insideGit) {
  sourceArchive = resolve(extensionRoot, "dist", `favlock-firefox-v${manifest.version}-source.zip`);
  const sourceFiles = [];
  for (const name of run("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "."], extensionRoot).split("\0")) {
    if (!name) continue;
    try {
      if ((await lstat(resolve(extensionRoot, name))).isSymbolicLink()) throw new Error(`Symlinks are forbidden: ${name}`);
      sourceFiles.push(name);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  sourceFiles.sort();
  const buildInputs = [
    ...packagedFiles.filter((name) => name !== "config.generated.js"),
    "README.md", "package.json", "package-lock.json", "scripts/configure.mjs", "scripts/package.mjs",
  ];
  const missing = buildInputs.filter((name) => !sourceFiles.includes(name));
  if (missing.length) throw new Error(`Source archive is missing build inputs: ${missing.join(", ")}`);
  if (sourceFiles.some((name) => /^(dist|node_modules)\/|(^|\/)config\.generated\.js$|(^|\/)\.env/.test(name))) {
    throw new Error("Source archive must not contain build output, dependencies, or environment files.");
  }
  await rm(sourceArchive, { force: true });
  run("zip", ["-X", "-q", sourceArchive, ...sourceFiles], extensionRoot);
  run("unzip", ["-tq", sourceArchive], extensionRoot);
  console.log(`Created ${sourceArchive} (${sourceFiles.length} source files).`);
}

if (process.argv.includes("--app-dist")) {
  const appOutputDirectory = resolve(extensionRoot, "../../dist/extensions/firefox");
  const appArchiveName = target === "development"
    ? `[dev]-favlock-firefox-extension-v${manifest.version}.zip`
    : `favlock-firefox-extension-v${manifest.version}.zip`;
  const appArchive = resolve(appOutputDirectory, appArchiveName);
  await mkdir(appOutputDirectory, { recursive: true });
  await copyFile(archive, appArchive);
  console.log(`Copied ${appArchive}.`);
  if (sourceArchive) {
    const appSourceArchive = resolve(appOutputDirectory, `favlock-firefox-extension-v${manifest.version}-source.zip`);
    await copyFile(sourceArchive, appSourceArchive);
    console.log(`Copied ${appSourceArchive}.`);
  }
}
