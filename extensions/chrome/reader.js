import { FAVLOCK_CONFIG } from "./config.js";

const captureId = new URLSearchParams(location.search).get("capture");
const articleDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
let article = null;

function setStatus(message) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.hidden = !message;
}

function setArticleDate(elementId, label, value) {
  const element = document.getElementById(elementId);
  if (!value) {
    element.textContent = "";
    return;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    element.textContent = "";
    return;
  }
  element.dateTime = date.toISOString();
  element.textContent = `${label} ${articleDateFormatter.format(date)}`;
}

function datesDisplayTheSame(publishedAt, updatedAt) {
  const published = new Date(publishedAt || "");
  const updated = new Date(updatedAt || "");
  return (
    !Number.isNaN(published.getTime()) &&
    !Number.isNaN(updated.getTime()) &&
    articleDateFormatter.format(published) === articleDateFormatter.format(updated)
  );
}

function formatByline(value) {
  const byline = String(value || "").trim();
  if (!byline) return "";
  return /^by\b/i.test(byline) ? byline : `By ${byline}`;
}

async function loadArticle() {
  if (!captureId) {
    setStatus("This reading view has expired. Open it again from the FavLock extension.");
    return;
  }

  const stored = await chrome.storage.session.get(`readerCapture:${captureId}`);
  article = stored[`readerCapture:${captureId}`] || null;
  if (!article?.html) {
    setStatus("This reading view has expired. Open it again from the FavLock extension.");
    return;
  }

  document.title = `${article.title} | FavLock Reader`;
  document.getElementById("title").textContent = article.title;
  document.getElementById("siteName").textContent = article.siteName || "Article";
  document.getElementById("byline").textContent = formatByline(article.byline);
  setArticleDate("publishedDate", "Published", article.publishedAt);
  setArticleDate(
    "updatedDate",
    "Updated",
    datesDisplayTheSame(article.publishedAt, article.updatedAt)
      ? ""
      : article.updatedAt,
  );
  const source = document.getElementById("sourceLink");
  source.href = article.sourceUrl;
  document.getElementById("content").innerHTML = article.html;
  document.getElementById("article").hidden = false;
  setStatus("");
}

async function saveToReading() {
  if (!article || !captureId) return;
  const button = document.getElementById("saveButton");
  const buttonLabel = document.getElementById("saveButtonLabel");
  button.disabled = true;
  buttonLabel.textContent = "Opening…";

  try {
    const saveUrl = new URL(FAVLOCK_CONFIG.dashboardUrl);
    saveUrl.pathname = `${saveUrl.pathname.replace(/\/+$/, "")}/readspace`;
    saveUrl.searchParams.set("capture", captureId);
    saveUrl.searchParams.set("chromeExtensionId", chrome.runtime.id);
    await chrome.tabs.create({ url: saveUrl.toString() });
  } catch (error) {
    console.error("Failed to save the article:", error);
    setStatus("Could not open FavLock. Try again.");
  } finally {
    button.disabled = false;
    buttonLabel.textContent = "Save to Readspace";
  }
}

function changeSize(delta) {
  const current = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--reader-size"),
  );
  const next = Math.min(25, Math.max(15, current + delta));
  document.documentElement.style.setProperty("--reader-size", `${next}px`);
  chrome.storage.local.set({ readerFontSize: next });
}

async function loadPreferences() {
  const { readerFontSize, readerTheme } = await chrome.storage.local.get([
    "readerFontSize",
    "readerTheme",
  ]);
  if (Number.isFinite(readerFontSize)) {
    document.documentElement.style.setProperty("--reader-size", `${readerFontSize}px`);
  }
  const savedTheme = ["white", "yellow", "dark"].includes(readerTheme)
    ? readerTheme
    : "yellow";
  applyReaderTheme(savedTheme);
}

function applyReaderTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll("[data-reader-theme]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.readerTheme === theme),
    );
  });
}

document.getElementById("decreaseSize").addEventListener("click", () => changeSize(-1));
document.getElementById("increaseSize").addEventListener("click", () => changeSize(1));
document.querySelectorAll("[data-reader-theme]").forEach((button) => {
  button.addEventListener("click", () => {
    const theme = button.dataset.readerTheme;
    applyReaderTheme(theme);
    chrome.storage.local.set({ readerTheme: theme });
  });
});
document.getElementById("saveButton").addEventListener("click", saveToReading);
document.getElementById("favlockDashboardLink").href =
  FAVLOCK_CONFIG.dashboardUrl;

window.addEventListener("pagehide", () => {
  if (captureId) {
    void chrome.storage.session.remove(`readerCapture:${captureId}`);
  }
});

void loadPreferences();
void loadArticle();
