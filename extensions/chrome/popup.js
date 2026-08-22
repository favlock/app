import {
  loadQuickAddData,
  loadSavedPageState,
  normalizeOpenTabs,
  saveCurrentPage,
  saveOpenTabsSession,
} from "./extension-data.js";
import { FAVLOCK_CONFIG } from "./config.js";

let activeTab = null;
let quickAddData = { folders: [], tags: [], lists: [] };
let savedPageState = null;
let openTabs = [];

function setStatus(message, kind = "error") {
  const status = document.getElementById("status");
  status.textContent = message;
  status.dataset.kind = kind;
}

function getDisplayHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "Current page";
  } catch {
    return "Current page";
  }
}

function setPageStateBadge(label, state) {
  const badge = document.getElementById("pageStateBadge");
  badge.textContent = label;
  badge.dataset.state = state;
}

async function setToolbarSavedState(saved) {
  if (!Number.isInteger(activeTab?.id)) return;
  const tabId = activeTab.id;
  const defaultBadge = FAVLOCK_CONFIG.target === "development" ? "DEV" : "";
  await Promise.allSettled([
    chrome.action.setBadgeBackgroundColor({
      color: saved ? "#0f766e" : "#b45309",
      tabId,
    }),
    chrome.action.setBadgeText({ text: saved ? "✓" : defaultBadge, tabId }),
    chrome.action.setTitle({
      title: saved ? "Saved in FavLock" : "Save, update, or read with FavLock",
      tabId,
    }),
  ]);
}

async function loadCurrentTabPreview() {
  const pageTitle = document.getElementById("pageTitle");
  const pageDomain = document.getElementById("pageDomain");
  try {
    [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    pageTitle.textContent = activeTab?.title || "Untitled page";
    pageDomain.textContent = activeTab?.url
      ? getDisplayHost(activeTab.url)
      : "Page details unavailable";
    pageTitle.title = pageTitle.textContent;
    pageDomain.title = activeTab?.url || "";
    document.getElementById("bookmarkTitle").value = activeTab?.title || "";
  } catch (error) {
    console.error("Failed to read current tab:", error);
    pageTitle.textContent = "Current tab";
    pageDomain.textContent = "Page details unavailable";
  }
}

function setConnectionView({ connected, unlocked, email = "" }) {
  const panel = document.getElementById("connectionPanel");
  const form = document.getElementById("quickAddForm");
  const button = document.getElementById("connectButton");
  const emailButton = document.getElementById("emailConnectButton");
  document.getElementById("disconnectButton").hidden = !connected;

  if (connected && unlocked) {
    panel.hidden = true;
    form.hidden = false;
    return;
  }

  panel.hidden = false;
  form.hidden = true;
  if (connected) {
    document.getElementById("connectionTitle").textContent = "Unlock FavLock";
    document.getElementById("connectionDescription").textContent = email
      ? `${email} is connected. Unlock your library to check and organize saved pages.`
      : "Unlock your library to check and organize saved pages.";
    button.textContent = "Unlock extension";
    button.dataset.action = "pair";
    emailButton.hidden = true;
  } else {
    document.getElementById("connectionTitle").textContent = "Connect FavLock";
    document.getElementById("connectionDescription").textContent =
      "Sign in or create an account with Google or email, then unlock your library.";
    button.textContent = "Continue with Google";
    button.dataset.action = "connect";
    emailButton.hidden = false;
  }
}

function renderCollections(folders) {
  const select = document.getElementById("collectionSelect");
  select.querySelectorAll("option[data-folder]").forEach((option) => option.remove());
  const createOption = select.querySelector('option[value="__new__"]');
  for (const folder of folders) {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = `${folder.parent_id ? "↳ " : ""}${folder.name}`;
    option.dataset.folder = "true";
    select.insertBefore(option, createOption);
  }
}

function renderLists(lists) {
  const container = document.getElementById("listOptions");
  container.replaceChildren();
  if (!lists.length) {
    const empty = document.createElement("span");
    empty.className = "empty-copy";
    empty.textContent = "No Lists yet";
    container.append(empty);
    document.getElementById("listPickerLabel").textContent = "No Lists available";
    return;
  }
  for (const list of lists) {
    const label = document.createElement("label");
    label.className = "tag-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = list.id;
    const text = document.createElement("span");
    text.textContent = list.name;
    label.append(input, text);
    container.append(label);
  }
  updateListPickerLabel();
}

function renderTags(tags) {
  const container = document.getElementById("tagOptions");
  container.replaceChildren();
  if (!tags.length) {
    const empty = document.createElement("span");
    empty.className = "empty-copy";
    empty.textContent = "No tags yet";
    container.append(empty);
    document.getElementById("tagPickerLabel").textContent = "No tags available";
    return;
  }
  for (const tag of tags) {
    const label = document.createElement("label");
    label.className = "tag-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = tag.id;
    const text = document.createElement("span");
    text.textContent = tag.name;
    label.append(input, text);
    container.append(label);
  }
  updateTagPickerLabel();
}

function updateTagPickerLabel() {
  const inputs = Array.from(
    document.querySelectorAll('#tagOptions input[type="checkbox"]'),
  );
  if (!inputs.length) {
    document.getElementById("tagPickerLabel").textContent = "No tags available";
    return;
  }
  const selected = inputs.filter((input) => input.checked);
  const atLimit = selected.length >= 10;
  for (const input of inputs) {
    input.disabled = atLimit && !input.checked;
  }

  const label = document.getElementById("tagPickerLabel");
  if (!selected.length) {
    label.textContent = "Select tags";
  } else if (selected.length === 1) {
    label.textContent = selected[0].nextElementSibling?.textContent || "1 tag selected";
  } else {
    label.textContent = `${selected.length} tags selected`;
  }
}

function updateListPickerLabel() {
  const inputs = Array.from(
    document.querySelectorAll('#listOptions input[type="checkbox"]'),
  );
  const label = document.getElementById("listPickerLabel");
  if (!inputs.length) {
    label.textContent = "No Lists available";
    return;
  }
  const selected = inputs.filter((input) => input.checked);
  if (!selected.length) {
    label.textContent = "Select Lists";
  } else if (selected.length === 1) {
    label.textContent = selected[0].nextElementSibling?.textContent || "1 List";
  } else {
    label.textContent = `${selected.length} Lists`;
  }
}

function applySavedPageState(state) {
  savedPageState = state;
  const saveButton = document.getElementById("saveBookmarkButton");
  const collectionSelect = document.getElementById("collectionSelect");
  const tagIds = new Set(state?.tagIds || []);
  const listIds = new Set(state?.listIds || []);

  if (state) {
    document.getElementById("bookmarkTitle").value = state.title;
    collectionSelect.value = state.folderId || "";
    setPageStateBadge("Saved", "saved");
    saveButton.textContent = "Update saved page";
  } else {
    setPageStateBadge("Not saved", "unsaved");
    saveButton.textContent = "Save page";
  }

  document
    .querySelectorAll('#tagOptions input[type="checkbox"]')
    .forEach((input) => {
      input.checked = tagIds.has(input.value);
    });
  document
    .querySelectorAll('#listOptions input[type="checkbox"]')
    .forEach((input) => {
      input.checked = listIds.has(input.value);
    });
  updateTagPickerLabel();
  updateListPickerLabel();
  saveButton.disabled = false;
  void setToolbarSavedState(!!state);
}

function revealCreationField(fieldId, inputId, pickerId) {
  document.getElementById(fieldId).hidden = false;
  document.getElementById(pickerId).open = false;
  document.getElementById(inputId).focus();
}

async function initializeConnection() {
  const response = await chrome.runtime.sendMessage({
    type: "favlock.extension.connection-state",
  });
  if (!response?.ok) {
    setConnectionView({ connected: false, unlocked: false });
    setPageStateBadge("Unavailable", "neutral");
    if (response?.error) setStatus(response.error);
    return false;
  }
  setConnectionView(response);
  if (!response.connected || !response.unlocked) {
    setPageStateBadge(response.connected ? "Locked" : "Not connected", "neutral");
    return false;
  }

  try {
    const [loadedQuickAddData, state] = await Promise.all([
      loadQuickAddData(),
      activeTab?.url ? loadSavedPageState(activeTab.url) : Promise.resolve(null),
    ]);
    quickAddData = loadedQuickAddData;
    renderCollections(quickAddData.folders);
    renderLists(quickAddData.lists);
    renderTags(quickAddData.tags);
    applySavedPageState(state);
  } catch (error) {
    setPageStateBadge("Unavailable", "neutral");
    setStatus(error instanceof Error ? error.message : "Could not load FavLock.");
  }
  return true;
}

async function connectOrPair() {
  const button = document.getElementById("connectButton");
  button.disabled = true;
  setStatus("");
  try {
    const response = await chrome.runtime.sendMessage({
      type:
        button.dataset.action === "pair"
          ? "favlock.extension.open-pairing"
          : "favlock.extension.connect",
    });
    if (!response?.ok) throw new Error(response?.error || "Connection failed.");
    setStatus(
      response.needsKey
        ? "Finish unlocking FavLock in the opened tab."
        : "FavLock is connected.",
      "success",
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Connection failed.");
  } finally {
    button.disabled = false;
  }
}

async function connectWithEmail() {
  const button = document.getElementById("emailConnectButton");
  button.disabled = true;
  setStatus("");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "favlock.extension.connect-email",
    });
    if (!response?.ok) throw new Error(response?.error || "Connection failed.");
    setStatus(
      "Finish signing in and unlocking FavLock in the opened tab.",
      "success",
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Connection failed.");
  } finally {
    button.disabled = false;
  }
}

async function submitQuickAdd(event) {
  event.preventDefault();
  const saveButton = document.getElementById("saveBookmarkButton");
  if (!activeTab?.url || !/^https?:\/\//i.test(activeTab.url)) {
    setStatus("This page cannot be saved as a bookmark.");
    return;
  }
  const collectionSelect = document.getElementById("collectionSelect");
  const selectedTagIds = Array.from(
    document.querySelectorAll('#tagOptions input[type="checkbox"]:checked'),
  ).map((input) => input.value);
  const selectedListIds = Array.from(
    document.querySelectorAll('#listOptions input[type="checkbox"]:checked'),
  ).map((input) => input.value);

  saveButton.disabled = true;
  saveButton.textContent = "Saving…";
  setStatus("");
  try {
    const result = await saveCurrentPage({
      title: document.getElementById("bookmarkTitle").value,
      url: activeTab.url,
      existingBookmarkId: savedPageState?.id || null,
      folderId:
        collectionSelect.value && collectionSelect.value !== "__new__"
          ? collectionSelect.value
          : null,
      newCollectionName:
        collectionSelect.value === "__new__"
          ? document.getElementById("newCollectionName").value
          : "",
      selectedListIds,
      newListName: document.getElementById("newListName").value,
      selectedTagIds,
      newTagNames: [document.getElementById("newTags").value],
      ...quickAddData,
    });
    setStatus(
      result.updatedExisting
        ? "Saved page updated in FavLock."
        : "Page saved to FavLock.",
      "success",
    );
    savedPageState = { id: result.bookmarkId };
    setPageStateBadge("Saved", "saved");
    void setToolbarSavedState(true);
    saveButton.textContent = result.updatedExisting ? "Page updated" : "Page saved";
    window.setTimeout(() => window.close(), 850);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not save bookmark.");
    saveButton.disabled = false;
    saveButton.textContent = savedPageState ? "Update saved page" : "Save page";
  }
}

function getDefaultTabSessionName() {
  const date = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  return `tabs — ${date}`;
}

async function showTabSession() {
  setStatus("");
  const tabs = await chrome.tabs.query({ currentWindow: true });
  openTabs = normalizeOpenTabs(tabs);
  if (!openTabs.length) {
    setStatus("There are no regular web tabs to save.");
    return;
  }

  const panel = document.getElementById("tabSessionPanel");
  const saveButton = document.getElementById("saveTabSessionButton");
  document.getElementById("tabSessionTag").value = getDefaultTabSessionName();
  document.getElementById("tabSessionCount").textContent =
    `${openTabs.length} ${openTabs.length === 1 ? "page" : "pages"} will share one session tag.`;
  saveButton.textContent = `Save ${openTabs.length} ${openTabs.length === 1 ? "tab" : "tabs"}`;
  document.getElementById("quickAddForm").classList.add("session-mode");
  panel.hidden = false;
  document.getElementById("tabSessionTag").focus();
}

function cancelTabSession() {
  openTabs = [];
  document.getElementById("tabSessionPanel").hidden = true;
  document.getElementById("quickAddForm").classList.remove("session-mode");
}

function formatTabSessionResult(result) {
  const parts = [];
  if (result.created) parts.push(`${result.created} new`);
  if (result.tagged) parts.push(`${result.tagged} existing tagged`);
  if (result.alreadyTagged) {
    parts.push(`${result.alreadyTagged} already in this session`);
  }
  if (result.skippedTagLimit) {
    parts.push(`${result.skippedTagLimit} skipped at the 10-tag limit`);
  }
  if (result.failed) parts.push(`${result.failed} failed`);
  return parts.length ? `${parts.join(", ")}.` : "Tabs already saved.";
}

async function saveTabSession() {
  const button = document.getElementById("saveTabSessionButton");
  const sessionTagName = document.getElementById("tabSessionTag").value;
  button.disabled = true;
  button.textContent = "Saving tabs…";
  setStatus("");

  try {
    const result = await saveOpenTabsSession({
      tabs: openTabs,
      sessionTagName,
      tags: quickAddData.tags,
    });
    const incomplete = result.failed > 0 || result.skippedTagLimit > 0;
    setStatus(
      formatTabSessionResult(result),
      incomplete ? "error" : "success",
    );
    button.textContent = incomplete ? "Try again" : "Tabs saved";
    button.disabled = !incomplete;
    if (!incomplete) window.setTimeout(() => window.close(), 1400);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not save open tabs.");
    button.disabled = false;
    button.textContent = `Save ${openTabs.length} ${openTabs.length === 1 ? "tab" : "tabs"}`;
  }
}

async function openDashboard() {
  await chrome.tabs.create({ url: FAVLOCK_CONFIG.dashboardUrl });
  window.close();
}

async function openSettings() {
  await chrome.runtime.openOptionsPage();
  window.close();
}

async function disconnect() {
  const response = await chrome.runtime.sendMessage({
    type: "favlock.extension.disconnect",
  });
  if (!response?.ok) {
    setStatus(response?.error || "Could not disconnect FavLock.");
    return;
  }
  setConnectionView({ connected: false, unlocked: false });
  savedPageState = null;
  setPageStateBadge("Not connected", "neutral");
  void setToolbarSavedState(false);
  setStatus("Local FavLock extension data was cleared.", "success");
}

async function openReaderMode() {
  const button = document.getElementById("openReaderButton");
  button.disabled = true;
  setStatus("");
  try {
    if (!activeTab?.id || !activeTab.url || !/^https?:\/\//i.test(activeTab.url)) {
      setStatus("Reader mode works on regular web pages.");
      return;
    }
    const [{ result: article } = {}] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ["reader-extractor.js"],
    });
    if (article?.blockedReason === "access-control") {
      setStatus("Reader is unavailable on restricted content.");
      return;
    }
    if (!article?.html || !article?.textLength) {
      setStatus("FavLock could not find enough article content on this page.");
      return;
    }
    const captureId = crypto.randomUUID();
    await chrome.storage.session.set({
      [`readerCapture:${captureId}`]: {
        ...article,
        capturedAt: new Date().toISOString(),
      },
    });
    await chrome.tabs.create({
      url: chrome.runtime.getURL(`reader.html?capture=${encodeURIComponent(captureId)}`),
    });
    window.close();
  } catch (error) {
    console.error("Failed to open reader mode:", error);
    setStatus("Could not open Reader on this page.");
  } finally {
    button.disabled = false;
  }
}

document.getElementById("connectButton").addEventListener("click", connectOrPair);
document
  .getElementById("emailConnectButton")
  .addEventListener("click", connectWithEmail);
document.getElementById("quickAddForm").addEventListener("submit", submitQuickAdd);
document.getElementById("showTabSessionButton").addEventListener("click", () => {
  void showTabSession();
});
document.getElementById("cancelTabSessionButton").addEventListener("click", cancelTabSession);
document.getElementById("saveTabSessionButton").addEventListener("click", () => {
  void saveTabSession();
});
document.getElementById("tabSessionTag").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  void saveTabSession();
});
document.getElementById("tagOptions").addEventListener("change", updateTagPickerLabel);
document.getElementById("listOptions").addEventListener("change", updateListPickerLabel);
document.getElementById("showNewListButton").addEventListener("click", () => {
  revealCreationField("newListField", "newListName", "listPicker");
});
document.getElementById("showNewTagsButton").addEventListener("click", () => {
  revealCreationField("newTagsField", "newTags", "tagPicker");
});
document.getElementById("collectionSelect").addEventListener("change", (event) => {
  document.getElementById("newCollectionField").hidden =
    event.target.value !== "__new__";
});
document.getElementById("openReaderButton").addEventListener("click", openReaderMode);
document.getElementById("openDashboardButton").addEventListener("click", openDashboard);
document.getElementById("openSettingsButton").addEventListener("click", openSettings);
document.getElementById("disconnectButton").addEventListener("click", disconnect);

document.getElementById("developmentBadge").hidden =
  FAVLOCK_CONFIG.target !== "development";
await loadCurrentTabPreview();
await initializeConnection();
