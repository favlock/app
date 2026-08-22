import { FAVLOCK_CONFIG } from "./config.js";

async function loadSettings() {
  const stored = await chrome.storage.sync.get("useFavLockNewTab");
  const newTabCheckbox = document.getElementById("useFavLockNewTab");

  newTabCheckbox.checked = stored.useFavLockNewTab !== false;
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
  const importUrl = new URL(FAVLOCK_CONFIG.dashboardUrl);

  await chrome.storage.sync.set({
    useFavLockNewTab: newTabCheckbox.checked,
  });
  importUrl.pathname = `${importUrl.pathname.replace(/\/+$/, "")}/settings`;
  importUrl.searchParams.set("chromeExtensionId", chrome.runtime.id);
  importUrl.searchParams.set("autoImport", "chrome");
  importUrl.hash = "import-bookmarks";

  await chrome.tabs.create({ url: importUrl.toString() });
}

document
  .getElementById("settingsForm")
  .addEventListener("submit", saveSettings);
document
  .getElementById("importBookmarksButton")
  .addEventListener("click", openChromeBookmarkImport);
loadSettings();
