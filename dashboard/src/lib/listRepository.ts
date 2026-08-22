import {
  deleteAuthenticatedWithoutResponse,
  fetchAuthenticatedJson,
  patchAuthenticatedJsonWithoutResponse,
  postAuthenticatedJson,
  postAuthenticatedJsonWithoutResponse,
  putAuthenticatedJsonWithoutResponse,
} from "./authenticatedApi";

const LIST_ERROR = "Could not load your encrypted Lists.";
const LIST_PAGE_SIZE = 100;
const LIST_ITEM_PAGE_SIZE = 200;
const ENCRYPTED_VALUE_MAX_LENGTH = 262_144;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface EncryptedListItem {
  bookmarkId: string;
  encryptedTitle: string;
  encryptedUrl: string;
  isFavorite: boolean;
  favoritedAt: string | null;
  bookmarkCreatedAt: string;
  position: number;
  completedAt: string | null;
  createdAt: string;
}

export interface EncryptedBookmarkList {
  id: string;
  encryptedName: string;
  createdAt: string;
  updatedAt: string;
  items: EncryptedListItem[];
}

type EncryptedListSummary = Omit<EncryptedBookmarkList, "items">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isEncryptedValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= ENCRYPTED_VALUE_MAX_LENGTH
  );
}

function parseList(value: unknown): EncryptedListSummary {
  if (!isRecord(value)) throw new Error(LIST_ERROR);
  const { id, encryptedName, createdAt, updatedAt } = value;
  if (
    !isUuid(id) ||
    !isEncryptedValue(encryptedName) ||
    !isTimestamp(createdAt) ||
    !isTimestamp(updatedAt)
  ) {
    throw new Error(LIST_ERROR);
  }
  return { id, encryptedName, createdAt, updatedAt };
}

function parseListItem(value: unknown): EncryptedListItem {
  if (!isRecord(value)) throw new Error(LIST_ERROR);
  const {
    bookmarkId,
    encryptedTitle,
    encryptedUrl,
    isFavorite,
    favoritedAt,
    bookmarkCreatedAt,
    position,
    completedAt,
    createdAt,
  } = value;
  if (
    !isUuid(bookmarkId) ||
    !isEncryptedValue(encryptedTitle) ||
    !isEncryptedValue(encryptedUrl) ||
    typeof isFavorite !== "boolean" ||
    (favoritedAt !== null && !isTimestamp(favoritedAt)) ||
    !isTimestamp(bookmarkCreatedAt) ||
    !Number.isSafeInteger(position) ||
    (position as number) < 0 ||
    (completedAt !== null && !isTimestamp(completedAt)) ||
    !isTimestamp(createdAt)
  ) {
    throw new Error(LIST_ERROR);
  }
  return {
    bookmarkId,
    encryptedTitle,
    encryptedUrl,
    isFavorite,
    favoritedAt,
    bookmarkCreatedAt,
    position: position as number,
    completedAt,
    createdAt,
  };
}

function parsePage<T extends { id?: string; bookmarkId?: string }>(
  value: unknown,
  maximum: number,
  parseItem: (item: unknown) => T,
  cursorFor: (item: T) => string,
): { items: T[]; nextCursor: string | null } {
  if (!isRecord(value) || !isRecord(value.data)) throw new Error(LIST_ERROR);
  const { items, nextCursor } = value.data;
  if (
    !Array.isArray(items) ||
    items.length > maximum ||
    (nextCursor !== null && !isUuid(nextCursor))
  ) {
    throw new Error(LIST_ERROR);
  }
  const parsed = items.map(parseItem);
  const cursors = parsed.map(cursorFor);
  if (new Set(cursors).size !== cursors.length) throw new Error(LIST_ERROR);
  if (nextCursor !== null && cursors.at(-1) !== nextCursor) {
    throw new Error(LIST_ERROR);
  }
  return { items: parsed, nextCursor };
}

async function fetchAllPages<T extends { id?: string; bookmarkId?: string }>(
  accessToken: string,
  basePath: `/v1/${string}`,
  maximum: number,
  parseItem: (item: unknown) => T,
  cursorFor: (item: T) => string,
): Promise<T[]> {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    const path: `/v1/${string}` = cursor
      ? `${basePath}?limit=${maximum}&cursor=${encodeURIComponent(cursor)}`
      : `${basePath}?limit=${maximum}`;
    const page = parsePage(
      await fetchAuthenticatedJson(path, accessToken, LIST_ERROR),
      maximum,
      parseItem,
      cursorFor,
    );
    items.push(...page.items);
    if (page.nextCursor === null) return items;
    if (seenCursors.has(page.nextCursor)) throw new Error(LIST_ERROR);
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

export async function fetchEncryptedLists(
  accessToken: string,
): Promise<EncryptedBookmarkList[]> {
  const summaries = await fetchAllPages(
    accessToken,
    "/v1/lists",
    LIST_PAGE_SIZE,
    parseList,
    (list) => list.id,
  );
  const lists: EncryptedBookmarkList[] = [];
  for (const summary of summaries) {
    const items = await fetchAllPages(
      accessToken,
      `/v1/lists/${encodeURIComponent(summary.id)}/items`,
      LIST_ITEM_PAGE_SIZE,
      parseListItem,
      (item) => item.bookmarkId,
    );
    lists.push({
      ...summary,
      items: items.sort(
        (left, right) =>
          left.position - right.position ||
          left.bookmarkId.localeCompare(right.bookmarkId),
      ),
    });
  }
  return lists.sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

export async function createEncryptedList(
  accessToken: string,
  encryptedName: string,
): Promise<string> {
  const payload = await postAuthenticatedJson(
    "/v1/lists",
    accessToken,
    { encryptedName },
    "Could not create the encrypted List.",
  );
  if (
    !isRecord(payload) ||
    !isRecord(payload.data) ||
    !isUuid(payload.data.listId)
  ) {
    throw new Error("Could not create the encrypted List.");
  }
  return payload.data.listId;
}

export function updateEncryptedList(
  accessToken: string,
  listId: string,
  encryptedName: string,
): Promise<void> {
  return patchAuthenticatedJsonWithoutResponse(
    listPath(listId),
    accessToken,
    { encryptedName },
    "Could not rename the encrypted List.",
  );
}

export function deleteEncryptedList(
  accessToken: string,
  listId: string,
): Promise<void> {
  return deleteAuthenticatedWithoutResponse(
    listPath(listId),
    accessToken,
    "Could not delete the List.",
  );
}

export function setListItemCompleted(
  accessToken: string,
  listId: string,
  bookmarkId: string,
  completed: boolean,
): Promise<void> {
  return patchAuthenticatedJsonWithoutResponse(
    `${listPath(listId)}/items/${encodeURIComponent(bookmarkId)}/completion`,
    accessToken,
    { completed },
    "Could not update the List item.",
  );
}

export function removeListItem(
  accessToken: string,
  listId: string,
  bookmarkId: string,
): Promise<void> {
  return deleteAuthenticatedWithoutResponse(
    `${listPath(listId)}/items/${encodeURIComponent(bookmarkId)}`,
    accessToken,
    "Could not remove the List item.",
  );
}

export function addListItem(
  accessToken: string,
  listId: string,
  bookmarkId: string,
): Promise<void> {
  return postAuthenticatedJsonWithoutResponse(
    `${listPath(listId)}/items`,
    accessToken,
    { bookmarkId },
    "Could not add the bookmark to the List.",
  );
}

export function setBookmarkLists(
  accessToken: string,
  bookmarkId: string,
  listIds: string[],
): Promise<void> {
  return putAuthenticatedJsonWithoutResponse(
    `/v1/bookmarks/${encodeURIComponent(bookmarkId)}/lists`,
    accessToken,
    { listIds: [...new Set(listIds)] },
    "Could not update the bookmark's Lists.",
  );
}

export function reorderListItems(
  accessToken: string,
  listId: string,
  bookmarkIds: string[],
): Promise<void> {
  return putAuthenticatedJsonWithoutResponse(
    `${listPath(listId)}/items/order`,
    accessToken,
    { bookmarkIds },
    "Could not reorder the List.",
  );
}

function listPath(listId: string): `/v1/lists/${string}` {
  return `/v1/lists/${encodeURIComponent(listId)}`;
}
