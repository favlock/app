import {
  BOOKMARK_SEARCH_MIN_CHARACTERS,
  getBookmarkSearchResults,
  loadQuickAddData,
  loadSearchableBookmarks,
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
let searchableBookmarks = [];
let visibleSearchResults = [];
let searchBookmarksLoaded = false;
let connectionReady = false;
let localVaultMode = false;

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
      title: saved ? "Saved in FavLock" : "Save or search with FavLock",
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

function setConnectionView({ connected, unlocked, email = "", cloudStatus = "available" }) {
  const panel = document.getElementById("connectionPanel");
  const form = document.getElementById("quickAddForm");
  const button = document.getElementById("connectButton");
  const connectedAccount = document.getElementById("connectedAccount");
  const modeSwitch = document.getElementById("modeSwitch");
  localVaultMode = cloudStatus === "local";
  connectionReady = connected && unlocked && ["available", "local"].includes(cloudStatus);
  modeSwitch.hidden = !connectionReady;
  document.getElementById("showTabSessionButton").hidden = localVaultMode;
  connectedAccount.hidden = !connected;
  connectedAccount.textContent = connected ? (localVaultMode ? "Local vault" : "Connected") : "";
  connectedAccount.title = localVaultMode ? "FavLock local vault connected" : email || "FavLock extension connected";

  if (connected && !["available", "local"].includes(cloudStatus)) {
    document.getElementById("bookmarkSearchPanel").hidden = true;
    document.getElementById("pagePreview").hidden = false;
    panel.hidden = false;
    form.hidden = true;
    document.getElementById("connectionTitle").textContent = "Local connection saved";
    document.getElementById("connectionDescription").textContent =
      `${email ? email + ". " : ""}Cloud access is ${cloudStatus === "offline" ? "offline" : "unavailable"}. Your saved key has not been cleared. Open the dashboard to use your saved local library.`;
    button.textContent = "Reconnect FavLock";
    return;
  }
  if (connected && unlocked) {
    panel.hidden = true;
    form.hidden = false;
    document.getElementById("pagePreview").hidden = false;
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
  } else {
    document.getElementById("connectionTitle").textContent = "Connect FavLock";
    document.getElementById("connectionDescription").textContent =
      "Sign in or create an account with Google or email, then unlock your library.";
    button.textContent = "Connect FavLock";
  }
}

function setModeSelection(mode) {
  const saveSelected = mode === "save";
  document.body.dataset.mode = mode;
  document.getElementById("saveModeButton").setAttribute(
    "aria-pressed",
    String(saveSelected),
  );
  document.getElementById("searchBookmarksButton").setAttribute(
    "aria-pressed",
    String(!saveSelected),
  );
}

function getSearchResultUrl(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function renderBookmarkSearchResults() {
  const query = document.getElementById("bookmarkSearchInput").value;
  const summary = document.getElementById("bookmarkSearchSummary");
  const results = document.getElementById("bookmarkSearchResults");
  results.replaceChildren();

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    visibleSearchResults = [];
    summary.textContent = searchBookmarksLoaded
      ? `Search ${searchableBookmarks.length} saved ${searchableBookmarks.length === 1 ? "bookmark" : "bookmarks"}.`
      : "Loading bookmarks…";
    return;
  }

  if (Array.from(trimmedQuery).length < BOOKMARK_SEARCH_MIN_CHARACTERS) {
    visibleSearchResults = [];
    summary.textContent = `Type at least ${BOOKMARK_SEARCH_MIN_CHARACTERS} characters to search.`;
    return;
  }

  if (!searchBookmarksLoaded) {
    visibleSearchResults = [];
    summary.textContent = "Loading bookmarks…";
    return;
  }

  const searchResults = getBookmarkSearchResults(searchableBookmarks, query);
  visibleSearchResults = searchResults.items;
  if (!visibleSearchResults.length) {
    summary.textContent = "No saved bookmarks match your search.";
    return;
  }

  summary.textContent = searchResults.total > visibleSearchResults.length
    ? `Showing ${visibleSearchResults.length} of ${searchResults.total} results`
    : `${searchResults.total} ${searchResults.total === 1 ? "result" : "results"}`;
  visibleSearchResults.forEach((bookmark, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bookmark-search-result";
    button.dataset.resultIndex = String(index);
    const title = document.createElement("strong");
    title.textContent = bookmark.title;
    const metadata = document.createElement("span");
    metadata.className = "bookmark-search-result-meta";
    metadata.title = bookmark.url;
    const metadataParts = [getDisplayHost(bookmark.url)];
    if (bookmark.collectionNames?.length) {
      metadataParts.push(bookmark.collectionNames.join(", "));
    }
    if (bookmark.tagNames?.length) {
      metadataParts.push(bookmark.tagNames.map((tag) => `#${tag}`).join(" "));
    }
    metadata.textContent = metadataParts.join(" · ");
    button.append(title, metadata);
    results.append(button);
  });
}

async function showBookmarkSearch() {
  if (!connectionReady) {
    setStatus("Connect and unlock FavLock to search your bookmarks.");
    return;
  }

  const panel = document.getElementById("bookmarkSearchPanel");
  document.getElementById("quickAddForm").hidden = true;
  document.getElementById("pagePreview").hidden = true;
  panel.hidden = false;
  setModeSelection("search");
  setStatus("");
  document.getElementById("bookmarkSearchInput").focus();

  if (searchBookmarksLoaded) {
    renderBookmarkSearchResults();
    return;
  }

  try {
    searchableBookmarks = await loadSearchableBookmarks(quickAddData);
    searchBookmarksLoaded = true;
    renderBookmarkSearchResults();
  } catch (error) {
    document.getElementById("bookmarkSearchSummary").textContent =
      error instanceof Error ? error.message : "Could not load saved bookmarks.";
  }
}

function showQuickSave({ focus = false } = {}) {
  document.getElementById("bookmarkSearchPanel").hidden = true;
  document.getElementById("quickAddForm").hidden = !connectionReady;
  document.getElementById("pagePreview").hidden = false;
  setModeSelection("save");
  if (focus) document.getElementById("saveModeButton").focus();
}

async function openSearchResult(index) {
  const url = getSearchResultUrl(visibleSearchResults[index]?.url);
  if (!url) {
    setStatus("This bookmark cannot be opened.");
    return;
  }
  await chrome.tabs.create({ url });
  window.close();
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
  updateMoreOptionsLabel();
}

function updateMoreOptionsLabel() {
  const selectedLists = document.querySelectorAll(
    '#listOptions input[type="checkbox"]:checked',
  ).length;
  const parts = [];
  if (selectedLists) {
    parts.push(`${selectedLists} ${selectedLists === 1 ? "List" : "Lists"}`);
  }
  document.getElementById("moreOptionsLabel").textContent = parts.length
    ? `More options · ${parts.join(", ")}`
    : "More options";
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
    setPageStateBadge(
      state.isHighlightSource ? "Not saved" : "Saved",
      state.isHighlightSource ? "unsaved" : "saved",
    );
    saveButton.textContent = state.isHighlightSource
      ? "Save page"
      : "Update saved page";
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
  void setToolbarSavedState(!!state && !state.isHighlightSource);
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
  if (!response.connected || !response.unlocked || (response.cloudStatus && !["available", "local"].includes(response.cloudStatus))) {
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
      type: "favlock.extension.connect",
    });
    if (!response?.ok) throw new Error(response?.error || "Connection failed.");
    setStatus(
      "Finish connecting FavLock in the opened tab.",
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
    const promotedHighlightSource = savedPageState?.isHighlightSource === true;
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
    if (result.pendingLocal) {
      setStatus("Finish saving in the opened local FavLock tab.", "success");
      saveButton.textContent = "Opened local vault";
      window.setTimeout(() => window.close(), 650);
      return;
    }
    setStatus(
      result.updatedExisting && !promotedHighlightSource
        ? "Saved page updated in FavLock."
        : "Page saved to FavLock.",
      "success",
    );
    savedPageState = { id: result.bookmarkId };
    setPageStateBadge("Saved", "saved");
    void setToolbarSavedState(true);
    saveButton.textContent = result.updatedExisting && !promotedHighlightSource
      ? "Page updated"
      : "Page saved";
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
document.getElementById("saveModeButton").addEventListener("click", () => {
  showQuickSave();
});
document.getElementById("searchBookmarksButton").addEventListener("click", () => {
  void showBookmarkSearch();
});
document.getElementById("bookmarkSearchInput").addEventListener("input", renderBookmarkSearchResults);
document.getElementById("bookmarkSearchInput").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    showQuickSave({ focus: true });
  } else if (event.key === "Enter" && visibleSearchResults.length) {
    event.preventDefault();
    void openSearchResult(0);
  }
});
document.getElementById("bookmarkSearchResults").addEventListener("click", (event) => {
  const result = event.target.closest("[data-result-index]");
  if (!result) return;
  void openSearchResult(Number(result.dataset.resultIndex));
});
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

document.getElementById("developmentBadge").hidden =
  FAVLOCK_CONFIG.target !== "development";
await loadCurrentTabPreview();
await initializeConnection();

// Close stale forms when this device explicitly switches or clears its account.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.favlockLocalEpoch) window.close();
});
