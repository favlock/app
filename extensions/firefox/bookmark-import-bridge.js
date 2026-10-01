import { FAVLOCK_CONFIG } from "./config.js";

const REQUEST_TYPE = "FAVLOCK_FIREFOX_BOOKMARKS_REQUEST";
const RESULT_TYPE = "FAVLOCK_FIREFOX_BOOKMARKS_RESULT";
const READY_TYPE = "FAVLOCK_FIREFOX_EXTENSION_READY";
const PING_TYPE = "FAVLOCK_FIREFOX_EXTENSION_PING";

function getDashboardOrigin() {
  return new URL(FAVLOCK_CONFIG.dashboardUrl).origin;
}

async function announceReady() {
  const dashboardOrigin = await getDashboardOrigin();
  if (!dashboardOrigin || window.parent === window) return;

  window.parent.postMessage({ type: READY_TYPE }, dashboardOrigin);
}

window.addEventListener("message", async (event) => {
  if (
    event.source !== window.parent ||
    ![PING_TYPE, REQUEST_TYPE].includes(event.data?.type)
  ) {
    return;
  }

  const dashboardOrigin = await getDashboardOrigin();
  if (!dashboardOrigin || event.origin !== dashboardOrigin) return;

  if (event.data.type === PING_TYPE) {
    window.parent.postMessage({ type: READY_TYPE }, dashboardOrigin);
    return;
  }

  const requestId =
    typeof event.data.requestId === "string" ? event.data.requestId : "";
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return;

  try {
    const response = await browser.runtime.sendMessage({ type: "favlock.firefox.bookmarks.read" });
    if (!response?.ok) {
      window.parent.postMessage(
        {
          type: RESULT_TYPE,
          requestId,
          error:
            response?.error || "Firefox could not read your bookmarks.",
        },
        dashboardOrigin,
      );
      return;
    }
    const tree = response.tree;
    window.parent.postMessage(
      { type: RESULT_TYPE, requestId, tree },
      dashboardOrigin,
    );
  } catch (error) {
    console.error("Failed to read Firefox bookmarks:", error);
    window.parent.postMessage(
      {
        type: RESULT_TYPE,
        requestId,
        error: "Firefox could not read your bookmarks. Reload the extension and try again.",
      },
      dashboardOrigin,
    );
  }
});

void announceReady();
