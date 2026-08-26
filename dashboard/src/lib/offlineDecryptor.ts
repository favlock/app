import {
  ENCRYPTED_ARCHIVE_FORMAT,
  ENCRYPTED_ARCHIVE_MAX_FILE_BYTES,
  ENCRYPTED_ARCHIVE_VERSION,
} from "./encryptedArchive";

export const OFFLINE_DECRYPTOR_FILENAME = "favlock-offline-decryptor.html";

export function buildOfflineDecryptorHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">
  <title>FavLock Offline Decryptor</title>
  <style>
    :root {
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, "Segoe UI", sans-serif;
      --app-bg: #f7f1df;
      --app-card: #fff8e7;
      --app-card-strong: #fff3ce;
      --app-ink: #202229;
      --app-muted: #525768;
      --app-line: #1d2230;
      --app-primary: #0f766e;
      --app-accent: #f59e0b;
      --app-secondary: #2563eb;
      background: var(--app-bg);
      color: var(--app-ink);
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      background:
        radial-gradient(circle at 8% 0%, rgba(245, 158, 11, .13), transparent 30%),
        radial-gradient(circle at 92% 0%, rgba(37, 99, 235, .09), transparent 28%),
        linear-gradient(180deg, #f5edda, var(--app-bg) 42rem);
    }
    main {
      width: min(100%, 620px);
      border: 1px solid rgba(29, 34, 48, .11);
      border-radius: 24px;
      background: rgba(255, 248, 231, .94);
      padding: 32px;
      box-shadow: 0 1px 2px rgba(29, 34, 48, .05), 0 24px 60px -36px rgba(29, 34, 48, .42);
    }
    .logo { display: block; width: 154px; height: auto; }
    h1 { margin: 28px 0 8px; font-size: clamp(24px, 5vw, 30px); line-height: 1.15; letter-spacing: -.035em; }
    p { margin: 0; color: var(--app-muted); font-size: 14px; line-height: 1.6; }
    .privacy {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-top: 18px;
      border: 1px solid rgba(15, 118, 110, .18);
      border-radius: 12px;
      background: rgba(220, 252, 231, .55);
      padding: 11px 13px;
      color: #285e59;
      font-weight: 600;
    }
    .privacy::before { width: 8px; height: 8px; flex: none; border-radius: 999px; background: var(--app-primary); content: ""; }
    form { margin-top: 26px; }
    .field + .field { margin-top: 20px; }
    label { display: block; font-size: 13px; font-weight: 700; color: var(--app-ink); }
    input {
      width: 100%;
      min-height: 46px;
      border: 1px solid rgba(29, 34, 48, .17);
      border-radius: 12px;
      background: rgba(255, 255, 255, .86);
      padding: 10px 12px;
      color: var(--app-ink);
      font: inherit;
      box-shadow: 0 1px 2px rgba(29, 34, 48, .05);
    }
    input[type="file"] { margin-top: 8px; padding: 5px 6px; color: var(--app-muted); }
    input::file-selector-button {
      min-height: 34px;
      margin-right: 10px;
      border: 1px solid rgba(29, 34, 48, .11);
      border-radius: 9px;
      background: var(--app-card-strong);
      padding: 6px 11px;
      color: var(--app-ink);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    input:focus-visible, button:focus-visible { outline: 2px solid rgba(15, 118, 110, .62); outline-offset: 2px; }
    .key-control { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; margin-top: 8px; }
    button {
      min-height: 46px;
      border-radius: 12px;
      padding: 10px 16px;
      font: inherit;
      font-weight: 750;
      cursor: pointer;
      transition: filter 150ms ease, box-shadow 150ms ease, transform 150ms ease;
    }
    button:hover:not(:disabled) { filter: brightness(1.035); }
    button:active:not(:disabled) { transform: translateY(1px); }
    button:disabled { cursor: not-allowed; opacity: .55; }
    .secondary {
      border: 1px solid rgba(29, 34, 48, .12);
      background: var(--app-card-strong);
      color: var(--app-ink);
      white-space: nowrap;
      box-shadow: 0 1px 2px rgba(29, 34, 48, .06);
    }
    .primary {
      width: 100%;
      margin-top: 24px;
      border: 1px solid rgba(15, 118, 110, .72);
      background: var(--app-primary);
      color: #fff;
      box-shadow: 0 1px 2px rgba(29, 34, 48, .14), 0 8px 20px -12px rgba(15, 118, 110, .58);
    }
    #status { margin-top: 14px; border-radius: 12px; background: rgba(220, 38, 38, .08); padding: 10px 12px; color: #b42318; font-size: 13px; font-weight: 600; }
    #status:empty { display: none; }
    #status.success { background: rgba(15, 118, 110, .09); color: var(--app-primary); }
    @media (max-width: 520px) {
      body { place-items: start center; padding: 12px; }
      main { border-radius: 20px; padding: 24px 20px; }
      .key-control { grid-template-columns: minmax(0, 1fr); }
      .secondary { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) { button { transition: none; } }
  </style>
</head>
<body>
  <main>
    <svg class="logo" width="184" height="44" viewBox="0 0 184 44" fill="none" aria-label="FavLock" role="img" focusable="false">
      <path d="M12 5h24a6 6 0 0 1 6 6v28.18a2 2 0 0 1-3.03 1.72L24 32.08 9.03 40.9A2 2 0 0 1 6 39.18V11a6 6 0 0 1 6-6Z" fill="var(--app-line)" opacity="0.18"/>
      <path d="M12 2h22a6 6 0 0 1 6 6v27.18a2 2 0 0 1-3.03 1.72L23 28.66 9.03 36.9A2 2 0 0 1 6 35.18V8a6 6 0 0 1 6-6Z" fill="var(--app-primary)" stroke="var(--app-line)" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="23" cy="16" r="8" fill="var(--app-accent)" stroke="var(--app-line)" stroke-width="1.75"/>
      <path d="M23 12.25a2.5 2.5 0 0 0-1.38 4.59l-1.12 3.41h5l-1.12-3.41A2.5 2.5 0 0 0 23 12.25Z" fill="var(--app-line)"/>
      <text x="51" y="29.5" fill="var(--app-ink)" font-family="'Space Grotesk', 'Avenir Next', 'Segoe UI', sans-serif" font-size="25.5" font-weight="650" letter-spacing="-1.15">Fav</text>
      <text x="94" y="29.5" fill="var(--app-primary)" font-family="'Space Grotesk', 'Avenir Next', 'Segoe UI', sans-serif" font-size="25.5" font-weight="800" letter-spacing="-1.15">Lock</text>
    </svg>
    <h1>Offline decryptor</h1>
    <p>Choose an encrypted archive and enter its recovery key.</p>
    <p class="privacy">Runs locally in this browser. Nothing is uploaded.</p>
    <form id="decrypt-form">
      <div class="field">
        <label for="archive">Encrypted archive</label>
        <input id="archive" name="archive" type="file" accept=".favlock,application/vnd.favlock.encrypted+json" required>
      </div>
      <div class="field">
        <label for="recovery-key">Recovery key</label>
        <div class="key-control">
          <input id="recovery-key" name="recovery-key" type="text" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Enter recovery key" required>
          <button id="recovery-key-file-button" class="secondary" type="button">Upload key file</button>
        </div>
        <input id="recovery-key-file" name="recovery-key-file" type="file" accept=".txt,text/plain" hidden>
      </div>
      <button id="decrypt" class="primary" type="submit">Decrypt and download</button>
      <p id="status" role="status" aria-live="polite"></p>
    </form>
  </main>
  <script>
    "use strict";
    const FORMAT = ${JSON.stringify(ENCRYPTED_ARCHIVE_FORMAT)};
    const VERSION = ${ENCRYPTED_ARCHIVE_VERSION};
    const MAX_FILE_BYTES = ${ENCRYPTED_ARCHIVE_MAX_FILE_BYTES};
    const MAX_RECOVERY_KEY_FILE_BYTES = ${16 * 1024};
    const encoder = new TextEncoder();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const form = document.getElementById("decrypt-form");
    const fileInput = document.getElementById("archive");
    const recoveryKeyInput = document.getElementById("recovery-key");
    const recoveryKeyFileInput = document.getElementById("recovery-key-file");
    const recoveryKeyFileButton = document.getElementById("recovery-key-file-button");
    const button = document.getElementById("decrypt");
    const status = document.getElementById("status");

    function fail(message) { throw new Error(message); }
    function bytes(value, length) {
      if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) fail("The archive is not valid.");
      let binary;
      try { binary = atob(value); } catch { fail("The archive is not valid."); }
      if (length !== undefined && binary.length !== length) fail("The archive is not valid.");
      const result = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) result[index] = binary.charCodeAt(index);
      return result;
    }
    function envelope(value) {
      if (!value || typeof value !== "object" || Array.isArray(value) || value.format !== FORMAT || value.version !== VERSION || !value.encryption || value.encryption.algorithm !== "AES-GCM" || value.encryption.keyLength !== 256 || value.encryption.tagLength !== 128 || !value.key || value.key.type !== "favlock-recovery-key" || !value.payload || value.payload.contentType !== "application/vnd.favlock.export+json" || value.payload.encoding !== "utf-8") fail("This archive is invalid or unsupported.");
      return value;
    }
    function normalizeRecoveryKey(value) {
      const match = value.match(/[A-Za-z0-9]{4}(?:[\\s-]*[A-Za-z0-9]{4}){7}/);
      const clean = (match ? match[0] : value).replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
      if (clean.length !== 32) fail("The recovery key must contain 32 letters or numbers.");
      return clean;
    }
    async function decryptArchive(value, recoveryKey) {
      if (!globalThis.crypto || !crypto.subtle) fail("Web Crypto is unavailable here. Open this file in a current browser, or serve it from localhost while offline.");
      const parsed = envelope(value);
      const key = await crypto.subtle.importKey("raw", encoder.encode(normalizeRecoveryKey(recoveryKey)), { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      let plaintext;
      try {
        plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(parsed.encryption.iv, 12), additionalData: encoder.encode(FORMAT + ":" + VERSION), tagLength: 128 }, key, bytes(parsed.payload.ciphertext));
      } catch {
        fail("Could not decrypt this archive. The recovery key may be incorrect or the file may be damaged.");
      }
      try { return JSON.parse(decoder.decode(plaintext)); } catch { fail("The decrypted archive does not contain valid FavLock data."); }
    }
    recoveryKeyFileButton.addEventListener("click", () => recoveryKeyFileInput.click());
    recoveryKeyFileInput.addEventListener("change", async () => {
      const file = recoveryKeyFileInput.files && recoveryKeyFileInput.files[0];
      if (!file) return;
      status.className = "";
      if (file.size > MAX_RECOVERY_KEY_FILE_BYTES) {
        status.textContent = "The recovery key file is too large.";
        recoveryKeyFileInput.value = "";
        return;
      }
      try {
        recoveryKeyInput.value = (await file.text()).trim();
        status.textContent = "Recovery key loaded.";
        status.className = "success";
      } catch {
        status.textContent = "Could not read the recovery key file.";
      }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.className = "";
      status.textContent = "";
      const file = fileInput.files && fileInput.files[0];
      if (!file) { status.textContent = "Choose a .favlock archive."; return; }
      if (file.size > MAX_FILE_BYTES) { status.textContent = "The encrypted archive is too large."; return; }
      button.disabled = true;
      button.textContent = "Decrypting...";
      try {
        const decrypted = await decryptArchive(JSON.parse(await file.text()), recoveryKeyInput.value);
        const blob = new Blob([JSON.stringify(decrypted, null, 2) + "\\n"], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "favlock-decrypted-export.json";
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        recoveryKeyInput.value = "";
        status.className = "success";
        status.textContent = "Decrypted file downloaded. Keep it private.";
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Could not decrypt this archive.";
      } finally {
        button.disabled = false;
        button.textContent = "Decrypt and download";
      }
    });
  </script>
</body>
</html>\n`;
}
