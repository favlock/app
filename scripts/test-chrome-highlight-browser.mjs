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
const chromeStartupTimeoutMs = 30_000;
const devToolsTargetTimeoutMs = 10_000;
const pollIntervalMs = 50;

const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

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
  const chromeArguments = [
    "--headless=new",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-gpu",
    "--no-first-run",
    "--no-sandbox",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDirectory}`,
    url,
  ];
  const chromeEnvironment = { ...process.env };
  if (process.platform === "linux") {
    chromeArguments.splice(-1, 0, "--disable-dev-shm-usage");
    delete chromeEnvironment.DBUS_SESSION_BUS_ADDRESS;
  }

  const child = spawn(chromePath, chromeArguments, {
    env: chromeEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  const childClosed = new Promise((resolve) => child.once("close", resolve));

  let chromeOutput = "";
  let spawnError;
  child.stdout.on("data", (chunk) => {
    chromeOutput += chunk;
  });
  child.stderr.on("data", (chunk) => {
    chromeOutput += chunk;
  });
  child.once("error", (error) => {
    spawnError = error;
  });

  const diagnosticSuffix = () => {
    const diagnostic = chromeOutput.trim();
    return diagnostic ? ` ${diagnostic}` : "";
  };

  const stopChrome = async () => {
    if (child.exitCode !== null || child.signalCode !== null) {
      await childClosed;
      return;
    }
    child.kill("SIGTERM");
    await Promise.race([childClosed, wait(2_000)]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await childClosed;
    }
  };

  const waitForDebuggerUrl = async () => {
    const activePortPath = join(userDataDirectory, "DevToolsActivePort");
    const deadline = Date.now() + chromeStartupTimeoutMs;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;

      const outputMatch = chromeOutput.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (outputMatch) return outputMatch[1];
      try {
        const [port, browserPath] = (await readFile(activePortPath, "utf8")).trim().split("\n");
        if (/^\d+$/.test(port) && browserPath?.startsWith("/")) {
          return `ws://127.0.0.1:${port}${browserPath}`;
        }
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `Headless Chrome exited before the test started (${child.exitCode ?? child.signalCode}).${diagnosticSuffix()}`,
        );
      }
      await wait(pollIntervalMs);
    }
    throw new Error(
      `Chrome DevTools did not start within ${chromeStartupTimeoutMs / 1_000} seconds.${diagnosticSuffix()}`,
    );
  };

  return (async () => {
    try {
      const debuggerUrl = await waitForDebuggerUrl();
      const debuggerOrigin = `http://${new URL(debuggerUrl).host}`;
      let target;
      let lastTargetError;
      const targetDeadline = Date.now() + devToolsTargetTimeoutMs;
      while (Date.now() < targetDeadline) {
        try {
          const response = await fetch(`${debuggerOrigin}/json/list`);
          if (!response.ok) throw new Error(`DevTools returned HTTP ${response.status}.`);
          const targets = await response.json();
          target = targets.find((candidate) => candidate.type === "page" && candidate.url === url);
          if (target?.webSocketDebuggerUrl) break;
        } catch (error) {
          lastTargetError = error;
        }
        await wait(pollIntervalMs);
      }
      if (!target?.webSocketDebuggerUrl) {
        const detail = lastTargetError instanceof Error ? ` ${lastTargetError.message}` : "";
        throw new Error(`Chrome did not open the highlight fixture.${detail}`);
      }

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
          await wait(pollIntervalMs);
        }
        throw new Error("Chrome highlight assertions timed out.");
      } finally {
        client.close();
      }
    } finally {
      await stopChrome();
    }
  })();
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
