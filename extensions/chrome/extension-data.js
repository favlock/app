import { FAVLOCK_CONFIG } from "./config.js";
import { getValidSession, readLocalAccount, assertLocalAccount, reportCloudFailure } from "./extension-auth.js";
import {
  decryptField,
  encryptField,
  loadLibraryKey,
} from "./extension-crypto.js";
import { readLocalProjection } from "./local-projection.js";

const keyAccounts = new WeakMap();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const LOCAL_BOOKMARK_CAPTURE_PREFIX = "localBookmarkCapture:";

async function authorizedRequest(path, options = {}, key) {
  const account = keyAccounts.get(key);
  await assertLocalAccount(account);
  const session = await getValidSession();
  if (!session) throw new Error("Connect the extension to FavLock first.");
  await assertLocalAccount(account);
  if (session.userId !== account.userId) throw new Error("The account changed. Reopen the extension.");
  let response;
  try { response = await fetch(`${FAVLOCK_CONFIG.apiUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  }); } catch {
    await reportCloudFailure(session.accessToken, "unavailable");
    throw new Error("Cloud request could not be confirmed. Check your library before retrying a save.");
  }
  await assertLocalAccount(account);
  if (response.status === 401 || response.status === 403) {
    await reportCloudFailure(session.accessToken, response.status === 401 ? "reconnect_required" : "restricted");
    throw new Error("Cloud access is unavailable. Your saved key remains on this device.");
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  await assertLocalAccount(account);
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || "FavLock request failed.",
    );
  }
  return payload;
}

async function loadAllPages(path, limit, key) {
  const items = [];
  let cursor = null;
  do {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set("cursor", cursor);
    const response = await authorizedRequest(`${path}?${query}`, {}, key);
    if (!response?.data || !Array.isArray(response.data.items)) {
      throw new Error("FavLock returned an invalid response.");
    }
    items.push(...response.data.items);
    cursor = response.data.nextCursor;
    if (cursor !== null && typeof cursor !== "string") {
      throw new Error("FavLock returned an invalid response.");
    }
  } while (cursor);
  return items;
}

async function getKey() {
  const account = await readLocalAccount();
  const key = await loadLibraryKey();
  if (!key) throw new Error("Unlock the FavLock extension first.");
  await assertLocalAccount(account);
  keyAccounts.set(key, account);
  return key;
}

export function normalizeBookmarkUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;

    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    let videoId = null;
    if (hostname === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v");
      } else {
        const [kind, candidate] = url.pathname.split("/").filter(Boolean);
        if (["shorts", "live"].includes(kind)) videoId = candidate ?? null;
      }
    }
    if (videoId && /^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeOpenTabs(
  tabs,
  dashboardUrl = FAVLOCK_CONFIG.dashboardUrl,
) {
  const dashboardOrigin = new URL(dashboardUrl).origin;
  const uniqueTabs = new Map();

  for (const tab of tabs || []) {
    const url = normalizeBookmarkUrl(tab?.url);
    if (!url || new URL(url).origin === dashboardOrigin || uniqueTabs.has(url)) {
      continue;
    }
    uniqueTabs.set(url, {
      title: String(tab?.title || "").trim() || new URL(url).hostname,
      url,
    });
  }

  return [...uniqueTabs.values()];
}

export async function loadQuickAddData() {
  const key = await getKey();
  if (keyAccounts.get(key)?.cloudStatus === "local") {
    const projection = await requireLocalProjection(key);
    const [folders, tags, lists] = await Promise.all([
      Promise.all(projection.folders.map(async (folder) => ({
        id: folder.id,
        name: await decryptField(folder.encryptedName, key),
        color: folder.color,
        parent_id: folder.parentId,
        sort_order: folder.sortOrder,
      }))),
      Promise.all(projection.tags.map(async (tag) => ({
        id: tag.id,
        name: await decryptField(tag.encryptedName, key),
      }))),
      Promise.all(projection.lists.map(async (list) => ({
        id: list.id,
        name: await decryptField(list.encryptedName, key),
      }))),
    ]);
    return { folders, tags, lists };
  }
  const [folderRows, tagRows, listRows] = await Promise.all([
    loadAllPages("/v1/library/folders", 200, key),
    loadAllPages("/v1/library/tags", 200, key),
    loadAllPages("/v1/lists", 100, key),
  ]);

  const [folders, tags, lists] = await Promise.all([
    Promise.all(
      (folderRows || []).map(async (folder) => ({
        id: folder.id,
        name: await decryptField(folder.encryptedName, key),
        color: folder.color,
        parent_id: folder.parentId,
        sort_order: folder.sortOrder,
      })),
    ),
    Promise.all(
      (tagRows || []).map(async (tag) => ({
        id: tag.id,
        name: await decryptField(tag.encryptedName, key),
      })),
    ),
    Promise.all(
      (listRows || []).map(async (list) => ({
        id: list.id,
        name: await decryptField(list.encryptedName, key),
      })),
    ),
  ]);

  return { folders, tags, lists };
}

async function requireLocalProjection(key) {
  const account = keyAccounts.get(key);
  const projection = await readLocalProjection(account?.userId);
  if (!projection) {
    throw new Error("Reconnect the extension to refresh your encrypted local library.");
  }
  await assertLocalAccount(account);
  return projection;
}

export function normalizeTagNames(names) {
  return [
    ...new Set(
      names
        .flatMap((name) => String(name).split(","))
        .map((name) => name.replace(/#/g, "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 10);
}

export function getBookmarkOrganization(bookmark) {
  return {
    folderId: bookmark?.folders?.[0]?.id || null,
    tagIds: [
      ...new Set(
        (bookmark?.tags || [])
          .map((tag) => tag?.id)
          .filter(Boolean),
      ),
    ],
    listIds: [
      ...new Set((bookmark?.listIds || []).filter(Boolean)),
    ],
  };
}

async function loadBookmarkUrlIndex(key) {
  const rows = await loadAllPages("/v1/library/bookmarks", 200, key);

  const decryptedRows = await Promise.all(
    rows.map(async (bookmark) => {
      try {
        return {
          bookmark,
          url: normalizeBookmarkUrl(
            await decryptField(bookmark.encryptedUrl, key),
          ),
        };
      } catch {
        return null;
      }
    }),
  );
  const index = new Map();
  for (const decrypted of decryptedRows) {
    if (!decrypted?.url || index.has(decrypted.url)) continue;
    const organization = getBookmarkOrganization(decrypted.bookmark);
    index.set(decrypted.url, {
      id: decrypted.bookmark.id,
      encryptedTitle: decrypted.bookmark.encryptedTitle,
      folderId: organization.folderId,
      tagIds: new Set(organization.tagIds),
      listIds: new Set(organization.listIds),
    });
  }
  return index;
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export const BOOKMARK_SEARCH_MIN_CHARACTERS = 2;
export const BOOKMARK_SEARCH_RESULT_LIMIT = 6;

export function filterSearchableBookmarks(bookmarks, query, limit = 20) {
  const terms = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length || limit <= 0) return [];

  return (bookmarks || [])
    .filter((bookmark) => {
      const searchableText = normalizeSearchText(
        [
          bookmark?.title,
          bookmark?.url,
          ...(bookmark?.collectionNames || []),
          ...(bookmark?.tagNames || []),
        ].join(" "),
      );
      return terms.every((term) => searchableText.includes(term));
    })
    .slice(0, limit);
}

export function getBookmarkSearchResults(bookmarks, query) {
  const queryLength = Array.from(normalizeSearchText(query).trim()).length;
  if (queryLength < BOOKMARK_SEARCH_MIN_CHARACTERS) {
    return { items: [], queryLength, total: 0 };
  }

  const matches = filterSearchableBookmarks(
    bookmarks,
    query,
    bookmarks?.length || 0,
  );
  return {
    items: matches.slice(0, BOOKMARK_SEARCH_RESULT_LIMIT),
    queryLength,
    total: matches.length,
  };
}

export async function loadSearchableBookmarks({ folders = [], tags = [] } = {}) {
  const key = await getKey();
  const localProjection = keyAccounts.get(key)?.cloudStatus === "local"
    ? await requireLocalProjection(key)
    : null;
  const rows = localProjection?.bookmarks ??
    await loadAllPages("/v1/library/bookmarks", 200, key);
  const folderNamesById = new Map(
    folders.map((folder) => [folder.id, folder.name]),
  );
  const tagNamesById = new Map(tags.map((tag) => [tag.id, tag.name]));
  const bookmarks = await Promise.all(
    rows.map(async (bookmark) => {
      try {
        const url = normalizeBookmarkUrl(
          await decryptField(bookmark.encryptedUrl, key),
        );
        if (!url) return null;
        const decryptedTitle = String(
          await decryptField(bookmark.encryptedTitle, key),
        ).trim();
        const organization = localProjection
          ? {
              folderId: bookmark.folderId,
              tagIds: bookmark.tagIds,
              listIds: bookmark.listIds,
            }
          : getBookmarkOrganization(bookmark);
        return {
          id: bookmark.id,
          title: decryptedTitle || new URL(url).hostname.replace(/^www\./, ""),
          url,
          collectionNames: [folderNamesById.get(organization.folderId)].filter(
            Boolean,
          ),
          tagNames: organization.tagIds
            .map((tagId) => tagNamesById.get(tagId))
            .filter(Boolean),
        };
      } catch {
        return null;
      }
    }),
  );

  return bookmarks.filter(Boolean);
}

export async function loadSavedPageState(url) {
  const normalizedUrl = normalizeBookmarkUrl(url);
  if (!normalizedUrl) return null;

  const key = await getKey();
  let existing;
  if (keyAccounts.get(key)?.cloudStatus === "local") {
    const projection = await requireLocalProjection(key);
    const decryptedRows = await Promise.all(projection.bookmarks.map(async (bookmark) => {
      try {
        return {
          bookmark,
          url: normalizeBookmarkUrl(await decryptField(bookmark.encryptedUrl, key)),
        };
      } catch {
        return null;
      }
    }));
    const match = decryptedRows.find((row) => row?.url === normalizedUrl)?.bookmark;
    existing = match ? {
      id: match.id,
      encryptedTitle: match.encryptedTitle,
      folderId: match.folderId,
      tagIds: new Set(match.tagIds),
      listIds: new Set(match.listIds),
    } : null;
  } else {
    existing = (await loadBookmarkUrlIndex(key)).get(normalizedUrl);
  }
  if (!existing) return null;

  return {
    id: existing.id,
    title: await decryptField(existing.encryptedTitle, key),
    folderId: existing.folderId,
    tagIds: [...existing.tagIds],
    listIds: [...existing.listIds],
  };
}

export function normalizeSessionTagName(name) {
  return String(name || "")
    .replace(/#/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

export function getListCreationErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("List limit reached")
    ? "Free includes up to 3 Lists. Upgrade to Pro for unlimited Lists."
    : message || "FavLock could not create the List.";
}

async function getOrCreateSessionTag(name, tags, key) {
  const cleanName = normalizeSessionTagName(name);
  if (!cleanName) throw new Error("Enter a name for this tab session.");

  const existingTag = tags.find(
    (tag) => tag.name.trim().toLowerCase() === cleanName,
  );
  if (existingTag) return existingTag.id;

  const response = await authorizedRequest("/v1/tags", {
    method: "POST",
    body: JSON.stringify({
      encryptedName: await encryptField(cleanName, key),
    }),
  }, key);
  const tagId = response?.data?.tagId;
  if (!tagId) throw new Error("FavLock could not create the session tag.");
  return tagId;
}

async function attachTagToBookmarks(bookmarkIds, tagId, key) {
  if (!bookmarkIds.length) return;
  await authorizedRequest(
    `/v1/tags/${tagId}/bookmarks`,
    {
      method: "POST",
      body: JSON.stringify({ bookmarkIds }),
    },
    key,
  );
}

async function createList(name, key) {
  const cleanName = String(name || "").replace(/\s+/g, " ").trim();
  if (!cleanName) throw new Error("Enter a name for the new List.");
  let rows;
  try {
    rows = await authorizedRequest("/v1/lists", {
      method: "POST",
      body: JSON.stringify({
        encryptedName: await encryptField(cleanName.slice(0, 80), key),
      }),
    }, key);
  } catch (error) {
    throw new Error(getListCreationErrorMessage(error));
  }
  const listId = rows?.data?.listId;
  if (!listId) throw new Error("FavLock could not create the List.");
  return listId;
}

async function setBookmarkListMemberships(bookmarkId, listIds, key) {
  await authorizedRequest(`/v1/bookmarks/${bookmarkId}/lists`, {
    method: "PUT",
    body: JSON.stringify({
      listIds: [...new Set(listIds)],
    }),
  }, key);
}

export async function saveOpenTabsSession({ tabs, sessionTagName, tags }) {
  const key = await getKey();
  if (keyAccounts.get(key)?.cloudStatus === "local") {
    throw new Error("Tab sessions need cloud sync. Save individual tabs to your local vault instead.");
  }
  const session = await getValidSession();
  if (!session) throw new Error("Connect the extension to FavLock first.");

  const pages = normalizeOpenTabs(tabs);
  if (!pages.length) throw new Error("There are no regular web tabs to save.");

  const tagId = await getOrCreateSessionTag(
    sessionTagName,
    tags,
    key,
  );
  const existingBookmarks = await loadBookmarkUrlIndex(key);
  const existingIdsToTag = [];
  const result = {
    created: 0,
    tagged: 0,
    alreadyTagged: 0,
    skippedTagLimit: 0,
    failed: 0,
  };

  for (const page of pages) {
    const existing = existingBookmarks.get(page.url);
    if (existing) {
      if (existing.tagIds.has(tagId)) {
        result.alreadyTagged += 1;
      } else if (existing.tagIds.size >= 10) {
        result.skippedTagLimit += 1;
      } else {
        existingIdsToTag.push(existing.id);
      }
      continue;
    }

    try {
      await authorizedRequest("/v1/bookmarks", {
        method: "POST",
        body: JSON.stringify({
          encryptedTitle: await encryptField(page.title, key),
          encryptedUrl: await encryptField(page.url, key),
          folderId: null,
          existingTagIds: [tagId],
          newEncryptedTagNames: [],
        }),
      }, key);
      result.created += 1;
    } catch {
      result.failed += 1;
    }
  }

  try {
    await attachTagToBookmarks(existingIdsToTag, tagId, key);
    result.tagged = existingIdsToTag.length;
  } catch {
    result.failed += existingIdsToTag.length;
  }

  return { ...result, total: pages.length };
}

async function createCollection(name, folders, key) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return null;
  const rootSortOrders = folders
    .filter((folder) => !folder.parent_id)
    .map((folder) => Number(folder.sort_order) || 0);
  const response = await authorizedRequest("/v1/folders", {
    method: "POST",
    body: JSON.stringify({
      encryptedName: await encryptField(cleanName, key),
      color: null,
      parentId: null,
      sortOrder: rootSortOrders.length ? Math.max(...rootSortOrders) + 1 : 0,
    }),
  }, key);
  return response?.data?.folderId || null;
}

export async function saveCurrentPage({
  title,
  url,
  existingBookmarkId,
  folderId,
  newCollectionName,
  selectedListIds,
  newListName,
  selectedTagIds,
  newTagNames,
  folders,
  tags,
}) {
  const key = await getKey();
  const account = keyAccounts.get(key);
  const session = account?.cloudStatus === "local"
    ? null
    : await getValidSession();
  if (account?.cloudStatus === "local") {
    const normalizedUrl = normalizeBookmarkUrl(url);
    if (!normalizedUrl) throw new Error("This page cannot be saved as a bookmark.");
    const fallbackTitle = new URL(normalizedUrl).hostname.replace(/^www\./, "");
    const cleanNewTagNames = normalizeTagNames(newTagNames || []);
    const selectedIds = [...new Set(selectedTagIds || [])]
      .filter((id) => UUID.test(id))
      .slice(0, 10);
    if (selectedIds.length + cleanNewTagNames.length > 10) {
      throw new Error("A bookmark can have at most 10 tags.");
    }
    const captureId = crypto.randomUUID();
    await chrome.storage.session.set({
      [`${LOCAL_BOOKMARK_CAPTURE_PREFIX}${captureId}`]: {
        version: 1,
        userId: account.userId,
        existingBookmarkId: UUID.test(existingBookmarkId || "")
          ? existingBookmarkId
          : null,
        encryptedTitle: await encryptField(title.trim() || fallbackTitle, key),
        encryptedUrl: await encryptField(normalizedUrl, key),
        folderId: UUID.test(folderId || "") ? folderId : null,
        selectedListIds: [...new Set(selectedListIds || [])].filter((id) => UUID.test(id)),
        existingTagIds: selectedIds,
        encryptedNewCollectionName: String(newCollectionName || "").trim()
          ? await encryptField(String(newCollectionName).trim().slice(0, 80), key)
          : null,
        encryptedNewListName: String(newListName || "").trim()
          ? await encryptField(String(newListName).trim().slice(0, 80), key)
          : null,
        newEncryptedTagNames: await Promise.all(
          cleanNewTagNames.map((name) => encryptField(name, key)),
        ),
        createdAt: new Date().toISOString(),
      },
    });
    const destination = new URL(FAVLOCK_CONFIG.dashboardUrl);
    destination.pathname = `${destination.pathname.replace(/\/+$/, "")}/extension/local-save`;
    destination.searchParams.set("capture", captureId);
    destination.searchParams.set("chromeExtensionId", chrome.runtime.id);
    await chrome.tabs.create({ url: destination.toString() });
    return { captureId, pendingLocal: true, updatedExisting: false };
  }
  if (!session) throw new Error("Connect the extension to FavLock first.");
  const normalizedUrl = normalizeBookmarkUrl(url);
  if (!normalizedUrl) throw new Error("This page cannot be saved as a bookmark.");
  const fallbackTitle = new URL(normalizedUrl).hostname.replace(/^www\./, "");
  const selectedIds = [...new Set(selectedTagIds)].slice(0, 10);
  const selectedIdSet = new Set(selectedIds);
  const existingNames = new Set(
    tags
      .filter((tag) => selectedIdSet.has(tag.id))
      .map((tag) => tag.name.trim().toLowerCase()),
  );
  const cleanNewTagNames = normalizeTagNames(newTagNames).filter(
    (name) => !existingNames.has(name),
  );
  if (selectedIds.length + cleanNewTagNames.length > 10) {
    throw new Error("A bookmark can have at most 10 tags.");
  }

  const createdListId = newListName
    ? await createList(newListName, key)
    : null;
  const targetListIds = [
    ...new Set([...(selectedListIds || []), createdListId].filter(Boolean)),
  ];

  const createdFolderId = await createCollection(
    newCollectionName,
    folders,
    key,
  );
  const encryptedNewTagNames = await Promise.all(
    cleanNewTagNames.map((name) => encryptField(name, key)),
  );
  const encryptedTitle = await encryptField(title.trim() || fallbackTitle, key);

  if (existingBookmarkId) {
    await authorizedRequest(`/v1/bookmarks/${existingBookmarkId}`, {
      method: "PUT",
      body: JSON.stringify({
        encryptedTitle,
        folderId: createdFolderId || folderId || null,
        existingTagIds: selectedIds,
        newEncryptedTagNames: encryptedNewTagNames,
      }),
    }, key);
    await setBookmarkListMemberships(existingBookmarkId, targetListIds, key);
    return { bookmarkId: existingBookmarkId, updatedExisting: true };
  }

  const created = await authorizedRequest(
    "/v1/bookmarks",
    {
      method: "POST",
      body: JSON.stringify({
        encryptedTitle,
        encryptedUrl: await encryptField(normalizedUrl, key),
        folderId: createdFolderId || folderId || null,
        existingTagIds: selectedIds,
        newEncryptedTagNames: encryptedNewTagNames,
      }),
    },
    key,
  );
  const bookmarkId = created?.data?.bookmarkId;
  if (!bookmarkId) throw new Error("FavLock could not save the bookmark.");
  if (targetListIds.length) {
    await setBookmarkListMemberships(bookmarkId, targetListIds, key);
  }
  return { bookmarkId, updatedExisting: false };
}
