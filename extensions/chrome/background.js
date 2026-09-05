import {
  beginExtensionConnection,
  disconnectExtension,
  getExternalOnboardingStatus,
  getConnectionState,
  receiveLocalProjection,
  receivePairedKey,
} from "./extension-auth.js";
import { FAVLOCK_CONFIG } from "./config.js";
import {
  FAVLOCK_CONTEXT_MENU_ITEMS,
  SAVE_HIGHLIGHT_CONTEXT_MENU_ID,
  SAVE_PAGE_CONTEXT_MENU_ID,
} from "./extension-context-menu.js";
import {
  DEFAULT_SHOW_HIGHLIGHTS_ON_WEBPAGES,
  DEFAULT_USE_FAVLOCK_NEW_TAB,
  resolveShowHighlightsOnWebpages,
  resolveUseFavLockNewTab,
} from "./extension-settings.js";
import {
  canAnnotateWebHighlights,
  deleteWebHighlight,
  loadWebHighlightsForUrl,
  saveWebHighlight,
  updateWebHighlightAnnotation,
  updateWebHighlightColor,
} from "./extension-data.js";
import {
  hasHighlightSiteAccess,
  removeGrantedHighlightSiteAccess,
  requestHighlightSiteAccess,
} from "./extension-permissions.js";
import {
  captureCurrentSelection,
  readSettledHighlightRenderResult,
  renderSavedHighlights,
  showHighlightNotice,
} from "./highlight-page.js";
import { getUnmatchedHighlightNotice } from "./extension-highlight-status.js";

const DEVELOPMENT_BADGE_TEXT = FAVLOCK_CONFIG.target === "development" ? "DEV" : "";
let showHighlightsOnWebpages = false;

async function loadHighlightPreference() {
  const stored = await chrome.storage.sync.get("showHighlightsOnWebpages");
  showHighlightsOnWebpages = resolveShowHighlightsOnWebpages(
    stored.showHighlightsOnWebpages,
  );
}

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
  const stored = await chrome.storage.sync.get([
    "showHighlightsOnWebpages",
    "useFavLockNewTab",
  ]);
  const settings = {};

  if (typeof stored.useFavLockNewTab !== "boolean") {
    settings.useFavLockNewTab = DEFAULT_USE_FAVLOCK_NEW_TAB;
  }
  if (typeof stored.showHighlightsOnWebpages !== "boolean") {
    settings.showHighlightsOnWebpages = DEFAULT_SHOW_HIGHLIGHTS_ON_WEBPAGES;
  }

  if (Object.keys(settings).length) {
    await chrome.storage.sync.set(settings);
  }

  await chrome.storage.sync.remove("dashboardUrl");

  await chrome.contextMenus.removeAll();
  for (const item of FAVLOCK_CONTEXT_MENU_ITEMS) {
    chrome.contextMenus.create({
      ...item,
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
  }
}

function isChromeNewTab(url) {
  return ["chrome://newtab", "chrome://newtab/"].includes(url);
}

async function maybeOpenFavLock(tabId, url) {
  if (!Number.isInteger(tabId) || !isChromeNewTab(url)) return;

  const stored = await chrome.storage.sync.get("useFavLockNewTab");
  if (!resolveUseFavLockNewTab(stored.useFavLockNewTab)) return;

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
      title: "Save or search with FavLock",
      tabId,
    }),
  ]);
}

async function restoreHighlightsForTab(tabId, url, warnIfUnmatched = false) {
  if (!Number.isInteger(tabId) || !/^https?:\/\//i.test(url || "")) return;
  if (!showHighlightsOnWebpages) return;
  try {
    if (!(await hasHighlightSiteAccess(chrome.permissions, url))) return;
    const [highlights, canAnnotate] = await Promise.all([
      loadWebHighlightsForUrl(url),
      canAnnotateWebHighlights().catch(() => false),
    ]);
    const currentTab = await chrome.tabs.get(tabId);
    if (currentTab.url !== url) return;
    const [{ result: renderResult } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      func: renderSavedHighlights,
      args: [highlights, false, canAnnotate],
    });
    let warning = warnIfUnmatched
      ? getUnmatchedHighlightNotice(renderResult)
      : null;
    if (warning) {
      const [{ result: settledResult } = {}] = await chrome.scripting.executeScript({
        target: { tabId },
        func: readSettledHighlightRenderResult,
        args: [750],
      });
      warning = getUnmatchedHighlightNotice(settledResult);
    }
    if (warning) {
      const settledTab = await chrome.tabs.get(tabId);
      if (settledTab.url !== url) return;
      await chrome.scripting.executeScript({
        target: { tabId },
        func: showHighlightNotice,
        args: [warning, "warning"],
      });
    }
  } catch {
    console.debug("FavLock could not restore highlights on this page.");
  }
}

async function clearVisibleHighlightsAndSiteAccess() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs.map(async (tab) => {
      if (!Number.isInteger(tab.id) || !/^https?:\/\//i.test(tab.url || "")) return;
      if (!(await hasHighlightSiteAccess(chrome.permissions, tab.url))) return;
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: renderSavedHighlights,
        args: [[]],
      });
    }),
  );

  const manifest = chrome.runtime.getManifest();
  const protectedOrigins = [
    ...(manifest.host_permissions || []),
    ...(manifest.content_scripts || []).flatMap((script) => script.matches || []),
  ];
  return removeGrantedHighlightSiteAccess(
    chrome.permissions,
    protectedOrigins,
  );
}

async function updateHighlightPreference(enabled) {
  showHighlightsOnWebpages = enabled;
  const removedSiteAccess = enabled
    ? 0
    : await clearVisibleHighlightsAndSiteAccess();
  await chrome.storage.sync.set({ showHighlightsOnWebpages: enabled });
  return removedSiteAccess;
}

chrome.runtime.onInstalled.addListener(initializeSettings);
chrome.runtime.onStartup.addListener(() => void restoreBuildBadge());
void restoreBuildBadge();
void loadHighlightPreference();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes.showHighlightsOnWebpages) return;
  const enabled = resolveShowHighlightsOnWebpages(
    changes.showHighlightsOnWebpages.newValue,
  );
  if (enabled === showHighlightsOnWebpages) return;
  showHighlightsOnWebpages = enabled;
  if (!enabled) void clearVisibleHighlightsAndSiteAccess();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === SAVE_HIGHLIGHT_CONTEXT_MENU_ID) {
    if (!Number.isInteger(tab?.id) || !tab?.url || !/^https?:\/\//i.test(tab.url)) return;
    const capturePromise = chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: captureCurrentSelection,
    });
    const shouldShowHighlights = showHighlightsOnWebpages;
    const siteAccessPromise = shouldShowHighlights
      ? requestHighlightSiteAccess(chrome.permissions, tab.url).catch(() => false)
      : Promise.resolve(false);
    void (async () => {
      let optimisticHighlightId = "";
      try {
        const [{ result: captured } = {}] = await capturePromise;
        const payload = captured || {
          version: 1,
          quote: { exact: info.selectionText || "", prefix: "", suffix: "" },
          position: null,
          dom: null,
          color: "yellow",
          note: "",
          capturedAt: new Date().toISOString(),
        };
        if (shouldShowHighlights) {
          optimisticHighlightId = `pending-${crypto.randomUUID()}`;
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: renderSavedHighlights,
            args: [[{ id: optimisticHighlightId, payload }], true, false],
          }).catch(() => undefined);
        }
        const [siteAccessGranted, saved] = await Promise.all([
          siteAccessPromise,
          saveWebHighlight({
            title: tab.title,
            url: tab.url,
            payload,
          }),
        ]);
        if (shouldShowHighlights) {
          const canAnnotate = await canAnnotateWebHighlights().catch(() => false);
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: renderSavedHighlights,
            args: [
              [{ id: saved.highlightId, payload }],
              true,
              canAnnotate,
              optimisticHighlightId,
            ],
          });
        }
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: showHighlightNotice,
          args: [
            !shouldShowHighlights
              ? "Highlight encrypted and saved to Readspace."
              : siteAccessGranted
              ? "Highlight saved. It will reappear on this site."
              : "Highlight saved. Automatic display is off for this site.",
            "success",
          ],
        });
      } catch (error) {
        if (optimisticHighlightId) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: renderSavedHighlights,
            args: [[], true, false, optimisticHighlightId],
          }).catch(() => undefined);
        }
        const message = error instanceof Error ? error.message : "Could not save the highlight.";
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: showHighlightNotice,
          args: [message, "error"],
        }).catch(() => undefined);
      }
    })();
    return;
  }
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    void clearSavedPageBadge(tabId);
    void maybeOpenFavLock(tabId, changeInfo.url);
    void restoreHighlightsForTab(tabId, changeInfo.url);
  }
  if (changeInfo.status === "complete" && tab?.url) {
    void restoreHighlightsForTab(tabId, tab.url, true);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "favlock.highlights.preference") {
    const validRequest = sender.id === chrome.runtime.id
      && typeof message.enabled === "boolean";
    if (!validRequest) {
      sendResponse({ ok: false, error: "FavLock could not update highlight access." });
      return false;
    }
    void updateHighlightPreference(message.enabled)
      .then((removedSiteAccess) => sendResponse({
        ok: true,
        removedSiteAccess,
      }))
      .catch(() => sendResponse({
        ok: false,
        error: "FavLock could not update highlight access.",
      }));
    return true;
  }

  if (message?.type === "favlock.highlight.delete") {
    const highlightId = String(message.highlightId || "");
    const tabId = sender.tab?.id;
    const url = sender.tab?.url;
    const validSender = sender.id === chrome.runtime.id
      && Number.isInteger(tabId)
      && /^https?:\/\//i.test(url || "")
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(highlightId);
    if (!validSender) {
      sendResponse({ ok: false, error: "Could not remove the highlight." });
      return false;
    }
    void (async () => {
      try {
        await deleteWebHighlight(highlightId);
        sendResponse({ ok: true });
      } catch {
        sendResponse({ ok: false, error: "Could not remove the highlight." });
      }
    })();
    return true;
  }

  if (message?.type === "favlock.highlight.annotate") {
    const highlightId = String(message.highlightId || "");
    const note = String(message.note || "");
    const tabId = sender.tab?.id;
    const url = sender.tab?.url;
    const validSender = sender.id === chrome.runtime.id
      && Number.isInteger(tabId)
      && /^https?:\/\//i.test(url || "")
      && note.length <= 10_000
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(highlightId);
    if (!validSender) {
      sendResponse({ ok: false, error: "Could not save the annotation." });
      return false;
    }
    void (async () => {
      try {
        if (!(await hasHighlightSiteAccess(chrome.permissions, url))) {
          throw new Error("Site access is unavailable.");
        }
        const highlights = await loadWebHighlightsForUrl(url);
        const highlight = highlights.find((item) => item.id === highlightId);
        if (!highlight) throw new Error("Highlight is not attached to the current page.");
        const payload = { ...highlight.payload, note: note.trim() };
        await updateWebHighlightAnnotation(
          highlightId,
          payload.note,
        );
        sendResponse({ ok: true, note: payload.note });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Could not save the annotation.",
        });
      }
    })();
    return true;
  }

  if (message?.type === "favlock.highlight.color") {
    const highlightId = String(message.highlightId || "");
    const color = String(message.color || "");
    const tabId = sender.tab?.id;
    const url = sender.tab?.url;
    const validSender = sender.id === chrome.runtime.id
      && Number.isInteger(tabId)
      && /^https?:\/\//i.test(url || "")
      && ["yellow", "green", "blue", "pink"].includes(color)
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(highlightId);
    if (!validSender) {
      sendResponse({ ok: false, error: "Could not update the highlight color." });
      return false;
    }
    void (async () => {
      try {
        if (!(await hasHighlightSiteAccess(chrome.permissions, url))) {
          throw new Error("Site access is unavailable.");
        }
        const highlights = await loadWebHighlightsForUrl(url);
        const highlight = highlights.find((item) => item.id === highlightId);
        if (!highlight) throw new Error("Highlight is not attached to the current page.");
        await updateWebHighlightColor(
          highlightId,
          color,
        );
        sendResponse({ ok: true, color });
      } catch {
        sendResponse({ ok: false, error: "Could not update the highlight color." });
      }
    })();
    return true;
  }

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
    const request =
      message?.type === "favlock.extension.onboarding-status"
        ? getExternalOnboardingStatus(message, sender)
        : message?.type === "favlock.extension.local-projection"
          ? receiveLocalProjection(message, sender)
        : receivePairedKey(message, sender);
    void request
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
