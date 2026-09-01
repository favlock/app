import { FAVLOCK_CONFIG } from "./config.js";
import { requestChromeBookmarkPermission } from "./extension-permissions.js";
import { resolveUseFavLockNewTab } from "./extension-settings.js";

async function loadSettings() {
  const stored = await chrome.storage.sync.get("useFavLockNewTab");
  const newTabCheckbox = document.getElementById("useFavLockNewTab");

  newTabCheckbox.checked = resolveUseFavLockNewTab(
    stored.useFavLockNewTab,
  );
}

async function loadConnection() {
  const description = document.getElementById("accountDescription");
  const disconnectButton = document.getElementById("disconnectButton");
  const response = await chrome.runtime.sendMessage({
    type: "favlock.extension.connection-state",
  });

  if (!response?.ok) {
    description.textContent = response?.error || "FavLock could not check this extension connection.";
    disconnectButton.hidden = true;
    return;
  }

  if (!response.connected) {
    description.textContent = "This extension is not connected. Use Connect FavLock from the popup to continue.";
    disconnectButton.hidden = true;
    return;
  }

  const identity = response.email ? `Connected as ${response.email}. ` : "";
  const availability = response.cloudStatus === "available"
    ? "Cloud access is available."
    : "The local connection is saved, but cloud access needs to be reconnected from the popup.";
  description.textContent = `${identity}${availability}`;
  disconnectButton.hidden = false;
}

async function disconnectExtension() {
  const confirmed = window.confirm(
    "Disconnect this extension? Its local session and encryption key will be removed. Your FavLock dashboard will stay signed in.",
  );
  if (!confirmed) return;

  const button = document.getElementById("disconnectButton");
  const status = document.getElementById("accountStatus");
  button.disabled = true;
  button.textContent = "Disconnecting…";
  status.textContent = "";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "favlock.extension.disconnect",
    });
    if (!response?.ok) {
      throw new Error(response?.error || "FavLock could not disconnect the extension.");
    }
    document.getElementById("accountDescription").textContent =
      "The extension is disconnected. Your FavLock dashboard session was not changed.";
    button.hidden = true;
    status.textContent = "Extension session and locally saved key removed.";
  } catch (error) {
    status.textContent = error instanceof Error
      ? error.message
      : "FavLock could not disconnect the extension.";
    button.disabled = false;
    button.textContent = "Disconnect extension";
  }
}

async function saveSettings(event) {
  event?.preventDefault();
  const status = document.getElementById("status");
  const newTabCheckbox = document.getElementById("useFavLockNewTab");

  await chrome.storage.sync.set({
    useFavLockNewTab: newTabCheckbox.checked,
  });

  status.textContent = "Saved.";
  window.setTimeout(() => {
    status.textContent = "";
  }, 1600);
}

async function openChromeBookmarkImport() {
  const status = document.getElementById("status");
  const newTabCheckbox = document.getElementById("useFavLockNewTab");
  const importButton = document.getElementById("importBookmarksButton");
  const importUrl = new URL(FAVLOCK_CONFIG.dashboardUrl);

  importButton.disabled = true;
  status.textContent = "Waiting for Chrome bookmark access…";
  try {
    const granted = await requestChromeBookmarkPermission(chrome.permissions);
    if (!granted) {
      status.textContent =
        "Bookmark access was not allowed. FavLock only needs it when you import from Chrome.";
      return;
    }

    await chrome.storage.sync.set({
      useFavLockNewTab: newTabCheckbox.checked,
    });
    importUrl.pathname = `${importUrl.pathname.replace(/\/+$/, "")}/settings`;
    importUrl.searchParams.set("chromeExtensionId", chrome.runtime.id);
    importUrl.searchParams.set("autoImport", "chrome");
    importUrl.hash = "import-bookmarks";

    await chrome.tabs.create({ url: importUrl.toString() });
    status.textContent = "Opening Chrome bookmark import…";
  } catch (error) {
    status.textContent = error instanceof Error
      ? error.message
      : "FavLock could not request Chrome bookmark access.";
  } finally {
    importButton.disabled = false;
  }
}

document
  .getElementById("settingsForm")
  .addEventListener("submit", saveSettings);
document
  .getElementById("importBookmarksButton")
  .addEventListener("click", openChromeBookmarkImport);
document
  .getElementById("disconnectButton")
  .addEventListener("click", disconnectExtension);
void Promise.all([loadSettings(), loadConnection()]);
