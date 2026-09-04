import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const highlightModulePath = join(
  repositoryRoot,
  "extensions/chrome/highlight-page.js",
);

const highlightModule = (await readFile(highlightModulePath, "utf8"))
  .replaceAll("</script", "<\\/script");
const fixture = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>FavLock highlight browser regression</title></head>
  <body>
    <p id="passage">Before saved passage after.</p>
    <pre id="result">RUNNING</pre>
    <script type="module">
      ${highlightModule}

      const result = document.getElementById("result");
      const highlightId = "00000000-0000-4000-8000-000000000001";
      const assert = (condition, message) => {
        if (!condition) throw new Error(message);
      };
      const registeredRanges = (name) => Array.from(CSS.highlights.get(name) || []);

      try {
        assert(CSS.highlights && typeof Highlight === "function", "CSS Custom Highlights unavailable");
        const text = document.getElementById("passage").firstChild;
        const range = document.createRange();
        range.setStart(text, 7);
        range.setEnd(text, 20);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        const payload = captureCurrentSelection();
        assert(payload?.quote?.exact === "saved passage", "Selection capture failed");

        renderSavedHighlights([{ id: "pending-create", payload }], false, false);
        assert(registeredRanges("favlock-yellow").length === 1, "Optimistic creation failed");
        renderSavedHighlights([], false, true);
        renderSavedHighlights([{ id: highlightId, payload }], false, true);
        const restored = registeredRanges("favlock-yellow");
        assert(restored.length === 1, "Refresh restoration did not register the highlight");
        assert(restored[0].toString() === "saved passage", "Restored the wrong text range");

        const highlightRule = Array.from(document.styleSheets)
          .flatMap((sheet) => Array.from(sheet.cssRules || []))
          .find((rule) => rule.selectorText?.includes("::highlight(favlock-yellow)"));
        assert(highlightRule?.style?.backgroundColor, "Highlight background color was not parsed");

        payload.color = "pink";
        renderSavedHighlights([{ id: highlightId, payload }], false, true);
        assert(registeredRanges("favlock-yellow").length === 0, "Old color remained registered");
        assert(registeredRanges("favlock-pink")[0]?.toString() === "saved passage", "Recolor failed");

        payload.note = "Private browser regression annotation";
        renderSavedHighlights([{ id: highlightId, payload }], false, true);
        assert(
          window.__favlockHighlights?.[0]?.payload?.note === payload.note,
          "Annotation state was not preserved",
        );

        renderSavedHighlights([], false, true);
        assert(registeredRanges("favlock-pink").length === 0, "Deleted highlight remained registered");
        assert(window.__favlockHighlights?.length === 0, "Deleted highlight remained in page state");
        result.textContent = "PASS";
        document.documentElement.dataset.testResult = "pass";
      } catch (error) {
        result.textContent = "FAIL: " + (error instanceof Error ? error.message : String(error));
        document.documentElement.dataset.testResult = "fail";
      }
    </script>
  </body>
</html>`;

async function findChrome() {
  const candidates = [
    process.env.FAVLOCK_CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next conventional Chrome location.
    }
  }
  throw new Error(
    "Chrome was not found. Set FAVLOCK_CHROME_BIN to run the browser highlight regression.",
  );
}

function runChrome(chromePath, url, userDataDirectory) {
  const child = spawn(chromePath, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-gpu",
    "--no-first-run",
    "--no-sandbox",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDirectory}`,
    url,
  ], { stdio: ["ignore", "ignore", "pipe"] });
  child.stderr.setEncoding("utf8");
  const childClosed = new Promise((resolve) => child.once("close", resolve));

  const debuggerUrlPromise = new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Chrome DevTools did not start.${stderr.trim() ? ` ${stderr.trim()}` : ""}`));
    }, 10_000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Headless Chrome exited before the test started (${code}).`));
    });
  });

  return debuggerUrlPromise.then(async (debuggerUrl) => {
    const debuggerOrigin = `http://${new URL(debuggerUrl).host}`;
    let target;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const targets = await fetch(`${debuggerOrigin}/json/list`).then((response) => response.json());
      target = targets.find((candidate) => candidate.type === "page" && candidate.url === url);
      if (target?.webSocketDebuggerUrl) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!target?.webSocketDebuggerUrl) throw new Error("Chrome did not open the highlight fixture.");

    const client = await openDevToolsClient(target.webSocketDebuggerUrl);
    try {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const evaluation = await client.send("Runtime.evaluate", {
          expression: "document.documentElement.dataset.testResult || ''",
          returnByValue: true,
        });
        const status = evaluation.result?.value;
        if (status === "pass") return;
        if (status === "fail") {
          const failure = await client.send("Runtime.evaluate", {
            expression: "document.getElementById('result')?.textContent || 'Unknown browser failure'",
            returnByValue: true,
          });
          throw new Error(failure.result?.value || "Unknown browser failure");
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("Chrome highlight assertions timed out.");
    } finally {
      client.close();
      child.kill("SIGTERM");
      await Promise.race([
        childClosed,
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
      if (child.exitCode === null) {
        child.kill("SIGKILL");
        await childClosed;
      }
    }
  }, (error) => {
    child.kill("SIGKILL");
    throw error;
  });
}

function openDevToolsClient(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 0;
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = ++nextId;
          return new Promise((resolveCommand, rejectCommand) => {
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          socket.close();
        },
      });
    }, { once: true });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const command = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) command.reject(new Error(message.error.message));
      else command.resolve(message.result);
    });
    socket.addEventListener("error", () => {
      reject(new Error("Could not connect to Chrome DevTools."));
    }, { once: true });
  });
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), "favlock-highlight-chrome-"));
const userDataDirectory = join(temporaryDirectory, "profile");
const fixturePath = join(temporaryDirectory, "highlight-regression.html");
try {
  await writeFile(fixturePath, fixture, "utf8");
  const chromePath = await findChrome();
  await runChrome(
    chromePath,
    pathToFileURL(fixturePath).href,
    userDataDirectory,
  );
  console.log("Headless Chrome highlight lifecycle passed.");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
