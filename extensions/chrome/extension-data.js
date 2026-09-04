import { FAVLOCK_CONFIG } from "./config.js";
import { getValidSession, readLocalAccount, assertLocalAccount, reportCloudFailure } from "./extension-auth.js";
import {
  decryptField,
  encryptField,
  loadLibraryKey,
} from "./extension-crypto.js";

const keyAccounts = new WeakMap();
const READSPACE_CONTENT_VERSION = 5;
const READSPACE_TITLE_MAX_LENGTH = 120;
const READSPACE_SERIALIZED_MAX_BYTES = 180_000;

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
      ...(typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
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
  if (response.status === 401) {
    await reportCloudFailure(session.accessToken, "reconnect_required");
    throw new Error("Cloud access is unavailable. Your saved key remains on this device.");
  }
  if (response.status === 403) {
    const forbiddenPayload = await response.json().catch(() => null);
    if (forbiddenPayload?.error?.code === "pro_required") {
      throw new Error("Annotations require FavLock Pro.");
    }
    await reportCloudFailure(session.accessToken, "restricted");
    throw new Error("Cloud access is unavailable. Your saved key remains on this device.");
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  await assertLocalAccount(account);
  if (!response.ok) {
    if (
      response.status === 400 &&
      payload?.error?.code === "quota_exceeded" &&
      payload?.error?.details?.resource === "highlights" &&
      payload.error.details.limit === 100
    ) {
      throw new Error(
        "Free includes up to 100 highlights. Upgrade to Pro for unlimited highlights.",
      );
    }
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
      isHighlightSource: decrypted.bookmark.isHighlightSource === true,
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
  const rows = await loadAllPages("/v1/library/bookmarks", 200, key);
  const folderNamesById = new Map(
    folders.map((folder) => [folder.id, folder.name]),
  );
  const tagNamesById = new Map(tags.map((tag) => [tag.id, tag.name]));
  const bookmarks = await Promise.all(
    rows.filter((bookmark) => bookmark.isHighlightSource !== true).map(async (bookmark) => {
      try {
        const url = normalizeBookmarkUrl(
          await decryptField(bookmark.encryptedUrl, key),
        );
        if (!url) return null;
        const decryptedTitle = String(
          await decryptField(bookmark.encryptedTitle, key),
        ).trim();
        const organization = getBookmarkOrganization(bookmark);
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
  const existing = (await loadBookmarkUrlIndex(key)).get(normalizedUrl);
  if (!existing) return null;

  return {
    id: existing.id,
    title: await decryptField(existing.encryptedTitle, key),
    folderId: existing.folderId,
    tagIds: [...existing.tagIds],
    listIds: [...existing.listIds],
    isHighlightSource: existing.isHighlightSource,
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
  const session = await getValidSession();
  const key = await getKey();
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
  const session = await getValidSession();
  const key = await getKey();
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

function normalizeReaderDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function serializeReaderArticle(article) {
  const sourceUrl = normalizeBookmarkUrl(article?.sourceUrl);
  const title = String(article?.title || "").trim().slice(0, READSPACE_TITLE_MAX_LENGTH);
  if (!sourceUrl || !title || !String(article?.html || "").trim()) {
    throw new Error("This article could not be prepared for encrypted storage.");
  }

  const payload = JSON.stringify({
    version: READSPACE_CONTENT_VERSION,
    title,
    siteName: String(article?.siteName || "").trim().slice(0, 200),
    byline: String(article?.byline || "").trim().slice(0, 300),
    publishedAt: normalizeReaderDate(article?.publishedAt),
    updatedAt: normalizeReaderDate(article?.updatedAt),
    sourceUrl,
    html: String(article.html),
    capturedAt: normalizeReaderDate(article?.capturedAt) || new Date().toISOString(),
  });
  if (new TextEncoder().encode(payload).byteLength > READSPACE_SERIALIZED_MAX_BYTES) {
    throw new Error("This article is too large to save to Readspace.");
  }
  return payload;
}

export async function saveReadspaceArticle(article) {
  const session = await getValidSession();
  const key = await getKey();
  if (!session) throw new Error("Connect the extension to FavLock first.");
  const serialized = serializeReaderArticle(article);
  const response = await authorizedRequest(
    "/v1/entries",
    {
      method: "POST",
      body: JSON.stringify({
        kind: "read",
        encryptedTitle: await encryptField(
          JSON.parse(serialized).title,
          key,
        ),
        encryptedContent: await encryptField(serialized, key),
        dueDate: null,
        folderId: null,
        existingTagIds: [],
        newEncryptedTagNames: [],
      }),
    },
    key,
  );
  if (!response?.data?.entryId) {
    throw new Error("FavLock could not confirm the saved article.");
  }
  return { entryId: response.data.entryId };
}

function validateHighlightPayload(payload) {
  const exact = String(payload?.quote?.exact || "").replace(/\s+/g, " ").trim();
  if (!exact || exact.length > 10_000) {
    throw new Error("Select between 1 and 10,000 characters to save a highlight.");
  }
  const integer = (value) => Number.isSafeInteger(value) && value >= 0;
  const position = payload?.position;
  const dom = payload?.dom;
  return {
    version: 1,
    quote: {
      exact,
      prefix: String(payload?.quote?.prefix || "").slice(-128),
      suffix: String(payload?.quote?.suffix || "").slice(0, 128),
    },
    position:
      integer(position?.start) && integer(position?.end) && position.end > position.start
        ? { start: position.start, end: position.end }
        : null,
    dom:
      typeof dom?.startPath === "string" && dom.startPath.length <= 1000 &&
      typeof dom?.endPath === "string" && dom.endPath.length <= 1000 &&
      integer(dom.startOffset) && integer(dom.endOffset)
        ? {
            startPath: dom.startPath,
            startOffset: dom.startOffset,
            endPath: dom.endPath,
            endOffset: dom.endOffset,
          }
        : null,
    color: ["yellow", "green", "blue", "pink"].includes(payload?.color)
      ? payload.color
      : "yellow",
    note: String(payload?.note || "").slice(0, 10_000),
    capturedAt: Number.isNaN(Date.parse(payload?.capturedAt))
      ? new Date().toISOString()
      : new Date(payload.capturedAt).toISOString(),
  };
}

async function encryptStructuredHighlightPayload(payload, key) {
  const validated = validateHighlightPayload(payload);
  const note = validated.note.trim();
  const [encryptedQuote, encryptedAnchors, encryptedAnnotation] = await Promise.all([
    encryptField(JSON.stringify(validated.quote), key),
    encryptField(JSON.stringify({
      position: validated.position,
      dom: validated.dom,
      capturedAt: validated.capturedAt,
    }), key),
    note ? encryptField(note, key) : Promise.resolve(null),
  ]);
  return {
    version: 1,
    encryptedQuote,
    encryptedAnchors,
    encryptedAnnotation,
    color: validated.color,
  };
}

async function decryptStructuredHighlightPayload(payload, key) {
  if (payload?.version !== 1) throw new Error("Unsupported highlight payload.");
  const [quote, anchors, note] = await Promise.all([
    decryptField(payload.encryptedQuote, key).then(JSON.parse),
    decryptField(payload.encryptedAnchors, key).then(JSON.parse),
    payload.encryptedAnnotation
      ? decryptField(payload.encryptedAnnotation, key)
      : Promise.resolve(""),
  ]);
  return validateHighlightPayload({
    version: 1,
    quote,
    position: anchors?.position,
    dom: anchors?.dom,
    color: payload.color,
    note,
    capturedAt: anchors?.capturedAt,
  });
}

export async function saveWebHighlight({ title, url, payload }) {
  const session = await getValidSession();
  const key = await getKey();
  if (!session) throw new Error("Connect the extension to FavLock first.");
  const normalizedUrl = normalizeBookmarkUrl(url);
  if (!normalizedUrl) throw new Error("Highlights work on regular web pages.");
  const index = await loadBookmarkUrlIndex(key);
  let bookmarkId = index.get(normalizedUrl)?.id || null;
  if (!bookmarkId) {
    const fallbackTitle = new URL(normalizedUrl).hostname.replace(/^www\./, "");
    const created = await authorizedRequest(
      "/v1/bookmarks/highlight-source",
      {
        method: "POST",
        body: JSON.stringify({
          encryptedTitle: await encryptField(String(title || "").trim() || fallbackTitle, key),
          encryptedUrl: await encryptField(normalizedUrl, key),
        }),
      },
      key,
    );
    bookmarkId = created?.data?.bookmarkId;
  }
  if (!bookmarkId) throw new Error("FavLock could not save the source bookmark.");
  const structuredPayload = await encryptStructuredHighlightPayload(payload, key);
  const created = await authorizedRequest(
    "/v1/highlights",
    {
      method: "POST",
      body: JSON.stringify({ bookmarkId, payload: structuredPayload }),
    },
    key,
  );
  if (!created?.data?.highlightId) {
    throw new Error("FavLock could not confirm the encrypted highlight.");
  }
  return { highlightId: created.data.highlightId, bookmarkId };
}

export async function loadWebHighlightsForUrl(url) {
  const normalizedUrl = normalizeBookmarkUrl(url);
  if (!normalizedUrl) return [];
  const key = await getKey();
  const bookmarkId = (await loadBookmarkUrlIndex(key)).get(normalizedUrl)?.id;
  if (!bookmarkId) return [];

  const encryptedRows = [];
  let offset = 0;
  do {
    const query = new URLSearchParams({
      bookmarkId,
      limit: "200",
      offset: String(offset),
    });
    const response = await authorizedRequest(`/v1/highlights?${query}`, {}, key);
    if (!Array.isArray(response?.data?.items)) {
      throw new Error("FavLock returned invalid encrypted highlights.");
    }
    encryptedRows.push(...response.data.items);
    const nextOffset = response.data.nextOffset;
    if (nextOffset === null) break;
    if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) {
      throw new Error("FavLock returned invalid highlight pagination.");
    }
    offset = nextOffset;
  } while (true);

  const highlights = await Promise.all(
    encryptedRows.map(async (row) => {
      try {
        const decryptedPayload = await decryptStructuredHighlightPayload(
          row?.payload,
          key,
        );
        return {
          id: String(row?.id || ""),
          payload: decryptedPayload,
        };
      } catch {
        return null;
      }
    }),
  );
  return highlights.filter((highlight) => highlight?.id);
}

export async function canAnnotateWebHighlights() {
  const key = await getKey();
  const response = await authorizedRequest("/v1/account/plan", {}, key);
  return response?.data?.id === "pro";
}

export async function updateWebHighlightAnnotation(
  highlightId,
  note,
) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(highlightId)) {
    throw new Error("FavLock received an invalid highlight.");
  }
  const key = await getKey();
  const normalizedNote = String(note || "").trim().slice(0, 10_000);
  const update = {
    encryptedAnnotation: normalizedNote
      ? await encryptField(normalizedNote, key)
      : null,
  };
  await authorizedRequest(
    `/v1/highlights/${encodeURIComponent(highlightId)}/annotation`,
    {
      method: "PUT",
      body: JSON.stringify(update),
    },
    key,
  );
}

export async function updateWebHighlightColor(
  highlightId,
  color,
) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(highlightId)) {
    throw new Error("FavLock received an invalid highlight.");
  }
  if (!["yellow", "green", "blue", "pink"].includes(color)) {
    throw new Error("FavLock received an invalid highlight color.");
  }
  const key = await getKey();
  const update = { color };
  await authorizedRequest(
    `/v1/highlights/${encodeURIComponent(highlightId)}/color`,
    {
      method: "PUT",
      body: JSON.stringify(update),
    },
    key,
  );
}

export async function deleteWebHighlight(highlightId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(highlightId)) {
    throw new Error("FavLock received an invalid highlight.");
  }
  const key = await getKey();
  await authorizedRequest(
    `/v1/highlights/${encodeURIComponent(highlightId)}`,
    { method: "DELETE" },
    key,
  );
}
