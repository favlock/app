import {
  fetchAuthenticatedJson,
  postAuthenticatedJson,
} from "./authenticatedApi";

const LIBRARY_ERROR = "Could not load your encrypted library.";
const ENTRY_PAGE_SIZE = 20;
const TAXONOMY_PAGE_SIZE = 200;
const BOOKMARK_PAGE_SIZE = 200;
const ENTRY_TITLE_MAX_LENGTH = 1_000;
const ENTRY_CONTENT_MAX_LENGTH = 250_000;
const TAXONOMY_NAME_MAX_LENGTH = 262_144;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const FOLDER_COLORS = new Set([
  "NONE",
  "RED",
  "ORANGE",
  "YELLOW",
  "GREEN",
  "CYAN",
  "BLUE",
  "PURPLE",
  "PINK",
]);

export type EncryptedLibraryFolder = {
  id: string;
  encryptedName: string;
  color:
    | "NONE"
    | "RED"
    | "ORANGE"
    | "YELLOW"
    | "GREEN"
    | "CYAN"
    | "BLUE"
    | "PURPLE"
    | "PINK"
    | null;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
};

export type EncryptedLibraryTag = {
  id: string;
  encryptedName: string;
  createdAt: string;
};

export type EncryptedLibraryEntry = {
  id: string;
  kind: "note" | "todo" | "read";
  encryptedTitle: string;
  encryptedContent: string;
  isCompleted: boolean;
  completedAt: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  folder: EncryptedLibraryFolder | null;
  tags: EncryptedLibraryTag[];
};

export type EncryptedLibraryBookmark = {
  id: string;
  encryptedTitle: string;
  encryptedUrl: string;
  isFavorite: boolean;
  favoritedAt: string | null;
  createdAt: string;
  folders: EncryptedLibraryFolder[];
  tags: EncryptedLibraryTag[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function parseFolder(value: unknown): EncryptedLibraryFolder {
  if (!isRecord(value)) throw new Error(LIBRARY_ERROR);
  const { id, encryptedName, color, parentId, sortOrder, createdAt } = value;
  if (
    !isUuid(id) ||
    typeof encryptedName !== "string" ||
    encryptedName.length > TAXONOMY_NAME_MAX_LENGTH ||
    (color !== null &&
      (typeof color !== "string" || !FOLDER_COLORS.has(color))) ||
    (parentId !== null && !isUuid(parentId)) ||
    !Number.isSafeInteger(sortOrder) ||
    (sortOrder as number) < 0 ||
    !isTimestamp(createdAt)
  ) {
    throw new Error(LIBRARY_ERROR);
  }
  return {
    id,
    encryptedName,
    color: color as EncryptedLibraryFolder["color"],
    parentId,
    sortOrder: sortOrder as number,
    createdAt,
  };
}

function parseTag(value: unknown): EncryptedLibraryTag {
  if (!isRecord(value)) throw new Error(LIBRARY_ERROR);
  const { id, encryptedName, createdAt } = value;
  if (
    !isUuid(id) ||
    typeof encryptedName !== "string" ||
    encryptedName.length > TAXONOMY_NAME_MAX_LENGTH ||
    !isTimestamp(createdAt)
  ) {
    throw new Error(LIBRARY_ERROR);
  }
  return { id, encryptedName, createdAt };
}

function parseEntry(value: unknown): EncryptedLibraryEntry {
  if (!isRecord(value)) throw new Error(LIBRARY_ERROR);
  const {
    id,
    kind,
    encryptedTitle,
    encryptedContent,
    isCompleted,
    completedAt,
    dueDate,
    createdAt,
    updatedAt,
    folder,
    tags,
  } = value;
  if (
    !isUuid(id) ||
    (kind !== "note" && kind !== "todo" && kind !== "read") ||
    typeof encryptedTitle !== "string" ||
    encryptedTitle.length > ENTRY_TITLE_MAX_LENGTH ||
    typeof encryptedContent !== "string" ||
    encryptedContent.length > ENTRY_CONTENT_MAX_LENGTH ||
    typeof isCompleted !== "boolean" ||
    (completedAt !== null && !isTimestamp(completedAt)) ||
    (dueDate !== null &&
      (typeof dueDate !== "string" || !DATE_PATTERN.test(dueDate))) ||
    !isTimestamp(createdAt) ||
    !isTimestamp(updatedAt) ||
    (folder !== null && !isRecord(folder)) ||
    !Array.isArray(tags) ||
    tags.length > 10
  ) {
    throw new Error(LIBRARY_ERROR);
  }
  if (
    kind === "todo"
      ? isCompleted !== (completedAt !== null)
      : isCompleted !== false || completedAt !== null || dueDate !== null
  ) {
    throw new Error(LIBRARY_ERROR);
  }
  return {
    id,
    kind,
    encryptedTitle,
    encryptedContent,
    isCompleted,
    completedAt,
    dueDate,
    createdAt,
    updatedAt,
    folder: folder === null ? null : parseFolder(folder),
    tags: tags.map(parseTag),
  };
}

function parseBookmark(value: unknown): EncryptedLibraryBookmark {
  if (!isRecord(value)) throw new Error(LIBRARY_ERROR);
  const {
    id,
    encryptedTitle,
    encryptedUrl,
    isFavorite,
    favoritedAt,
    createdAt,
    folders,
    tags,
  } = value;
  if (
    !isUuid(id) ||
    typeof encryptedTitle !== "string" ||
    encryptedTitle.length > TAXONOMY_NAME_MAX_LENGTH ||
    typeof encryptedUrl !== "string" ||
    encryptedUrl.length > TAXONOMY_NAME_MAX_LENGTH ||
    typeof isFavorite !== "boolean" ||
    (favoritedAt !== null && !isTimestamp(favoritedAt)) ||
    !isTimestamp(createdAt) ||
    !Array.isArray(folders) ||
    folders.length > 1 ||
    !Array.isArray(tags) ||
    tags.length > 10
  ) {
    throw new Error(LIBRARY_ERROR);
  }
  return {
    id,
    encryptedTitle,
    encryptedUrl,
    isFavorite,
    favoritedAt,
    createdAt,
    folders: folders.map(parseFolder),
    tags: tags.map(parseTag),
  };
}

function parsePage<T>(
  value: unknown,
  maximum: number,
  parseItem: (item: unknown) => T & { id: string },
): { items: T[]; nextCursor: string | null } {
  if (!isRecord(value) || !isRecord(value.data)) {
    throw new Error(LIBRARY_ERROR);
  }
  const { items, nextCursor } = value.data;
  if (
    !Array.isArray(items) ||
    items.length > maximum ||
    (nextCursor !== null && !isUuid(nextCursor))
  ) {
    throw new Error(LIBRARY_ERROR);
  }
  const parsed = items.map(parseItem);
  if (new Set(parsed.map(({ id }) => id)).size !== parsed.length) {
    throw new Error(LIBRARY_ERROR);
  }
  if (nextCursor !== null && parsed.at(-1)?.id !== nextCursor) {
    throw new Error(LIBRARY_ERROR);
  }
  return { items: parsed, nextCursor };
}

async function fetchAll<T extends { id: string }>(
  accessToken: string,
  resource: "bookmarks" | "entries" | "folders" | "tags",
  maximum: number,
  parseItem: (item: unknown) => T,
  ids?: string[],
): Promise<T[]> {
  if (ids) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.some((id) => !UUID_PATTERN.test(id))) {
      throw new Error(LIBRARY_ERROR);
    }
    const items: T[] = [];
    for (let offset = 0; offset < uniqueIds.length; offset += maximum) {
      const page = parsePage(
        await postAuthenticatedJson(
          `/v1/library/${resource}/resolve`,
          accessToken,
          { ids: uniqueIds.slice(offset, offset + maximum) },
          LIBRARY_ERROR,
        ),
        maximum,
        parseItem,
      );
      if (page.nextCursor !== null) throw new Error(LIBRARY_ERROR);
      items.push(...page.items);
    }
    return items;
  }

  const items: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    const path: `/v1/${string}` = cursor
      ? `/v1/library/${resource}?limit=${maximum}&cursor=${encodeURIComponent(cursor)}`
      : `/v1/library/${resource}?limit=${maximum}`;
    const page: { items: T[]; nextCursor: string | null } = parsePage(
      await fetchAuthenticatedJson(path, accessToken, LIBRARY_ERROR),
      maximum,
      parseItem,
    );
    items.push(...page.items);
    if (page.nextCursor === null) return items;
    if (seenCursors.has(page.nextCursor)) throw new Error(LIBRARY_ERROR);
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

async function fetchSample<T extends { id: string }>(
  accessToken: string,
  resource: "bookmarks" | "entries" | "folders" | "tags",
  parseItem: (item: unknown) => T,
): Promise<T[]> {
  const page = parsePage(
    await fetchAuthenticatedJson(
      `/v1/library/${resource}?limit=10`,
      accessToken,
      LIBRARY_ERROR,
    ),
    10,
    parseItem,
  );
  return page.items;
}

export function fetchEncryptedLibraryEntries(
  accessToken: string,
  ids?: string[],
): Promise<EncryptedLibraryEntry[]> {
  return fetchAll(accessToken, "entries", ENTRY_PAGE_SIZE, parseEntry, ids);
}

export function fetchEncryptedLibraryBookmarks(
  accessToken: string,
  ids?: string[],
): Promise<EncryptedLibraryBookmark[]> {
  return fetchAll(
    accessToken,
    "bookmarks",
    BOOKMARK_PAGE_SIZE,
    parseBookmark,
    ids,
  );
}

export function fetchEncryptedLibraryFolders(
  accessToken: string,
  ids?: string[],
): Promise<EncryptedLibraryFolder[]> {
  return fetchAll(accessToken, "folders", TAXONOMY_PAGE_SIZE, parseFolder, ids);
}

export function fetchEncryptedLibraryTags(
  accessToken: string,
  ids?: string[],
): Promise<EncryptedLibraryTag[]> {
  return fetchAll(accessToken, "tags", TAXONOMY_PAGE_SIZE, parseTag, ids);
}

export function fetchEncryptedLibraryEntrySample(
  accessToken: string,
): Promise<EncryptedLibraryEntry[]> {
  return fetchSample(accessToken, "entries", parseEntry);
}

export function fetchEncryptedLibraryBookmarkSample(
  accessToken: string,
): Promise<EncryptedLibraryBookmark[]> {
  return fetchSample(accessToken, "bookmarks", parseBookmark);
}

export function fetchEncryptedLibraryFolderSample(
  accessToken: string,
): Promise<EncryptedLibraryFolder[]> {
  return fetchSample(accessToken, "folders", parseFolder);
}

export function fetchEncryptedLibraryTagSample(
  accessToken: string,
): Promise<EncryptedLibraryTag[]> {
  return fetchSample(accessToken, "tags", parseTag);
}
