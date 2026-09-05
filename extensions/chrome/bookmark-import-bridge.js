import { FAVLOCK_CONFIG } from "./config.js";
import { hasChromeBookmarkPermission } from "./extension-permissions.js";

const REQUEST_TYPE = "FAVLOCK_CHROME_BOOKMARKS_REQUEST";
const RESULT_TYPE = "FAVLOCK_CHROME_BOOKMARKS_RESULT";
const READY_TYPE = "FAVLOCK_CHROME_EXTENSION_READY";
const PING_TYPE = "FAVLOCK_CHROME_EXTENSION_PING";
const READER_REQUEST_TYPE = "FAVLOCK_READER_CAPTURE_REQUEST";
const READER_RESULT_TYPE = "FAVLOCK_READER_CAPTURE_RESULT";
const READER_DELETE_TYPE = "FAVLOCK_READER_CAPTURE_DELETE";
const LOCAL_BOOKMARK_REQUEST_TYPE = "FAVLOCK_LOCAL_BOOKMARK_CAPTURE_REQUEST";
const LOCAL_BOOKMARK_RESULT_TYPE = "FAVLOCK_LOCAL_BOOKMARK_CAPTURE_RESULT";
const LOCAL_BOOKMARK_DELETE_TYPE = "FAVLOCK_LOCAL_BOOKMARK_CAPTURE_DELETE";
const CAPTURE_ID_PATTERN = /^[0-9a-f-]{20,64}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validEncryptedValue(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 262144;
}

function normalizeLocalBookmarkCapture(capture) {
  if (
    capture?.version !== 1 ||
    !UUID_PATTERN.test(capture.userId || "") ||
    !validEncryptedValue(capture.encryptedTitle) ||
    !validEncryptedValue(capture.encryptedUrl) ||
    (capture.existingBookmarkId != null &&
      !UUID_PATTERN.test(capture.existingBookmarkId || "")) ||
    (capture.folderId !== null && !UUID_PATTERN.test(capture.folderId || "")) ||
    !Array.isArray(capture.selectedListIds) ||
    !Array.isArray(capture.existingTagIds) ||
    !Array.isArray(capture.newEncryptedTagNames) ||
    capture.selectedListIds.length > 3 ||
    capture.existingTagIds.length > 10 ||
    capture.newEncryptedTagNames.length > 10 ||
    !capture.selectedListIds.every((id) => UUID_PATTERN.test(id)) ||
    !capture.existingTagIds.every((id) => UUID_PATTERN.test(id)) ||
    !capture.newEncryptedTagNames.every(validEncryptedValue) ||
    (capture.encryptedNewCollectionName !== null && !validEncryptedValue(capture.encryptedNewCollectionName)) ||
    (capture.encryptedNewListName !== null && !validEncryptedValue(capture.encryptedNewListName)) ||
    typeof capture.createdAt !== "string" ||
    Number.isNaN(Date.parse(capture.createdAt))
  ) return null;
  return {
    version: 1,
    userId: capture.userId,
    existingBookmarkId: capture.existingBookmarkId ?? null,
    encryptedTitle: capture.encryptedTitle,
    encryptedUrl: capture.encryptedUrl,
    folderId: capture.folderId,
    selectedListIds: [...new Set(capture.selectedListIds)],
    existingTagIds: [...new Set(capture.existingTagIds)],
    encryptedNewCollectionName: capture.encryptedNewCollectionName,
    encryptedNewListName: capture.encryptedNewListName,
    newEncryptedTagNames: capture.newEncryptedTagNames,
    createdAt: capture.createdAt,
  };
}

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
    ![
      PING_TYPE,
      REQUEST_TYPE,
      READER_REQUEST_TYPE,
      READER_DELETE_TYPE,
      LOCAL_BOOKMARK_REQUEST_TYPE,
      LOCAL_BOOKMARK_DELETE_TYPE,
    ].includes(
      event.data?.type,
    )
  ) {
    return;
  }

  const dashboardOrigin = await getDashboardOrigin();
  if (!dashboardOrigin || event.origin !== dashboardOrigin) return;

  if (event.data.type === PING_TYPE) {
    window.parent.postMessage({ type: READY_TYPE }, dashboardOrigin);
    return;
  }

  if ([LOCAL_BOOKMARK_REQUEST_TYPE, LOCAL_BOOKMARK_DELETE_TYPE].includes(event.data.type)) {
    const captureId = typeof event.data.captureId === "string" ? event.data.captureId : "";
    if (!CAPTURE_ID_PATTERN.test(captureId)) return;
    const storageKey = `localBookmarkCapture:${captureId}`;
    if (event.data.type === LOCAL_BOOKMARK_DELETE_TYPE) {
      await chrome.storage.session.remove(storageKey);
      return;
    }
    const stored = await chrome.storage.session.get(storageKey);
    window.parent.postMessage(
      {
        type: LOCAL_BOOKMARK_RESULT_TYPE,
        requestId: typeof event.data.requestId === "string" ? event.data.requestId : "",
        capture: normalizeLocalBookmarkCapture(stored[storageKey]),
      },
      dashboardOrigin,
    );
    return;
  }

  if (
    [READER_REQUEST_TYPE, READER_DELETE_TYPE].includes(event.data.type)
  ) {
    const captureId =
      typeof event.data.captureId === "string" ? event.data.captureId : "";
    if (!CAPTURE_ID_PATTERN.test(captureId)) return;
    const storageKey = `readerCapture:${captureId}`;

    if (event.data.type === READER_DELETE_TYPE) {
      await chrome.storage.session.remove(storageKey);
      return;
    }

    const stored = await chrome.storage.session.get(storageKey);
    const capture = stored[storageKey];
    window.parent.postMessage(
      {
        type: READER_RESULT_TYPE,
        requestId:
          typeof event.data.requestId === "string" ? event.data.requestId : "",
        capture: capture
          ? {
              title: capture.title,
              siteName: capture.siteName,
              byline: capture.byline,
              publishedAt: capture.publishedAt,
              updatedAt: capture.updatedAt,
              sourceUrl: capture.sourceUrl,
              html: capture.html,
              capturedAt: capture.capturedAt,
            }
          : null,
      },
      dashboardOrigin,
    );
    await chrome.storage.session.remove(storageKey);
    return;
  }

  const requestId =
    typeof event.data.requestId === "string" ? event.data.requestId : "";
  if (!requestId) return;

  try {
    const hasPermission = await hasChromeBookmarkPermission(chrome.permissions);
    if (!hasPermission) {
      window.parent.postMessage(
        {
          type: RESULT_TYPE,
          requestId,
          error:
            "Allow Chrome bookmark access from FavLock extension settings, then try the import again.",
        },
        dashboardOrigin,
      );
      return;
    }
    const tree = await chrome.bookmarks.getTree();
    window.parent.postMessage(
      { type: RESULT_TYPE, requestId, tree },
      dashboardOrigin,
    );
  } catch (error) {
    console.error("Failed to read Chrome bookmarks:", error);
    window.parent.postMessage(
      {
        type: RESULT_TYPE,
        requestId,
        error: "Chrome could not read your bookmarks. Reload the extension and try again.",
      },
      dashboardOrigin,
    );
  }
});

void announceReady();
