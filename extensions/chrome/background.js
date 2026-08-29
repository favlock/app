import {
  beginExtensionConnection,
  disconnectExtension,
  getConnectionState,
  receivePairedKey,
} from "./extension-auth.js";
import { FAVLOCK_CONFIG } from "./config.js";

const DEFAULT_USE_FAVLOCK_NEW_TAB = true;
const SAVE_PAGE_CONTEXT_MENU_ID = "favlock-save-page";
const DEVELOPMENT_BADGE_TEXT = FAVLOCK_CONFIG.target === "development" ? "DEV" : "";

async function restoreBuildBadge(tabId) {
  const badgeOptions = Number.isInteger(tabId)
    ? { text: DEVELOPMENT_BADGE_TEXT, tabId }
    : { text: DEVELOPMENT_BADGE_TEXT };
  await Promise.allSettled([
    chrome.action.setBadgeBackgroundColor({ color: "#b45309", ...(Number.isInteger(tabId) ? { tabId } : {}) }),
    chrome.action.setBadgeText(badgeOptions),
  ]);
}

async function initializeSettings() {
  const stored = await chrome.storage.sync.get("useFavLockNewTab");
  const settings = {};

  if (typeof stored.useFavLockNewTab !== "boolean") {
    settings.useFavLockNewTab = DEFAULT_USE_FAVLOCK_NEW_TAB;
  }

  if (Object.keys(settings).length) {
    await chrome.storage.sync.set(settings);
  }

  await chrome.storage.sync.remove("dashboardUrl");

  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: SAVE_PAGE_CONTEXT_MENU_ID,
    title: "Save page",
    contexts: ["all"],
    documentUrlPatterns: ["http://*/*", "https://*/*"],
  });
}

function isChromeNewTab(url) {
  return ["chrome://newtab", "chrome://newtab/"].includes(url);
}

async function maybeOpenFavLock(tabId, url) {
  if (!Number.isInteger(tabId) || !isChromeNewTab(url)) return;

  const stored = await chrome.storage.sync.get("useFavLockNewTab");
  if (stored.useFavLockNewTab === false) return;

  try {
    await chrome.tabs.update(tabId, {
      url: FAVLOCK_CONFIG.dashboardUrl,
    });
  } catch (error) {
    console.debug("FavLock could not redirect the new tab:", error);
  }
}

async function clearSavedPageBadge(tabId) {
  await Promise.allSettled([
    restoreBuildBadge(tabId),
    chrome.action.setTitle({
      title: "Save, update, or read with FavLock",
      tabId,
    }),
  ]);
}

chrome.runtime.onInstalled.addListener(initializeSettings);
chrome.runtime.onStartup.addListener(() => void restoreBuildBadge());
void restoreBuildBadge();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== SAVE_PAGE_CONTEXT_MENU_ID) return;

  void (async () => {
    if (typeof chrome.action.openPopup !== "function") return;
    try {
      await chrome.action.openPopup(
        Number.isInteger(tab?.windowId) ? { windowId: tab.windowId } : {},
      );
    } catch (error) {
      console.debug("FavLock could not open Quick Save:", error);
    }
  })();
});

chrome.tabs.onCreated.addListener((tab) => {
  void maybeOpenFavLock(tab.id, tab.pendingUrl || tab.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    void clearSavedPageBadge(tabId);
    void maybeOpenFavLock(tabId, changeInfo.url);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "favlock.extension.pair-key") {
    void receivePairedKey(message, sender)
      .then((response) => sendResponse(response || { ok: false }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Pairing failed.",
        }),
      );
    return true;
  }

  if (message?.type === "favlock.extension.connect") {
    void beginExtensionConnection()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Connection failed.",
        }),
      );
    return true;
  }

  if (message?.type === "favlock.extension.disconnect") {
    void disconnectExtension()
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Disconnect failed.",
        }),
      );
    return true;
  }

  if (message?.type === "favlock.extension.connection-state") {
    void getConnectionState()
      .then((state) => sendResponse({ ok: true, ...state }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error:
            error instanceof Error ? error.message : "Connection check failed.",
        }),
      );
    return true;
  }

  if (message?.type === "favlock.extension.open-pairing") {
    void beginExtensionConnection()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Connection failed.",
        }),
      );
    return true;
  }
});

chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    void receivePairedKey(message, sender)
      .then((response) => sendResponse(response || { ok: false }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Pairing failed.",
        }),
      );
    return true;
  },
);
