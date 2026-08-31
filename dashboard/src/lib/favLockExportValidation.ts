import { PRESET_COLORS } from "../constants/colors";
import type {
  ExportedBookmark,
  ExportedCollection,
  ExportedEntry,
  ExportedList,
  ExportedListItem,
  ExportedTag,
  ExportedTodo,
  ExportSelection,
  FavLockExport,
} from "./dataExport";
import { normalizeImportedBookmarkUrl } from "./browserBookmarkImport";
import { sanitizeEntryHtml } from "./entryContent";
import {
  parseReadspaceContent,
  serializeReadspaceContent,
} from "./readspaceContent";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_COLLECTIONS = 10_000;
const MAX_TAGS = 10_000;
const MAX_BOOKMARKS = 100_000;
const MAX_LISTS = 10_000;
const MAX_LIST_ITEMS = 10_000;
const MAX_MIGRATION_ITEMS = 125_000;
const MAX_ENTRIES = 1_000;
const MAX_READSPACE = 250;
const MAX_RELATION_IDS = 10;
const MAX_NAME_LENGTH = 5_000;
const MAX_BOOKMARK_VALUE_LENGTH = 10_000;
const MAX_ENTRY_TITLE_LENGTH = 120;
const MAX_ENTRY_CONTENT_LENGTH = 180_000;
const MAX_ENTRY_CONTENT_BYTES = 180_000;
const MAX_READSPACE_CONTENT_BYTES = 180_000;

function invalidArchive(): Error {
  return new Error("The decrypted file is not a valid FavLock export.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw invalidArchive();
  return value;
}

function requireArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw invalidArchive();
  return value;
}

function requireString(value: unknown, maximum: number, allowEmpty = false): string {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    (!allowEmpty && value.trim().length === 0)
  ) {
    throw invalidArchive();
  }
  return value;
}

function requireUuid(value: unknown): string {
  const result = requireString(value, 36);
  if (!UUID_PATTERN.test(result)) throw invalidArchive();
  return result;
}

function requireDate(value: unknown): string {
  const result = requireString(value, 64);
  if (Number.isNaN(Date.parse(result))) throw invalidArchive();
  return result;
}

function requireNullableDate(value: unknown): string | null {
  return value === null ? null : requireDate(value);
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalidArchive();
  return value;
}

function requireInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw invalidArchive();
  }
  return value as number;
}

function requireUuidArray(value: unknown, maximum = MAX_RELATION_IDS): string[] {
  const ids = requireArray(value, maximum).map(requireUuid);
  if (new Set(ids).size !== ids.length) throw invalidArchive();
  return ids;
}

function requireUniqueIds<T extends { id: string }>(items: T[]): void {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw invalidArchive();
  }
}

function parseSelection(value: unknown): ExportSelection {
  const selection = requireRecord(value);
  return {
    bookmarks: requireBoolean(selection.bookmarks),
    notes: requireBoolean(selection.notes),
    todos: requireBoolean(selection.todos),
    readspace: requireBoolean(selection.readspace),
  };
}

function parseCollection(value: unknown): ExportedCollection {
  const collection = requireRecord(value);
  const color = collection.color;
  if (color !== null && !PRESET_COLORS.includes(color as never)) {
    throw invalidArchive();
  }
  return {
    id: requireUuid(collection.id),
    name: requireString(collection.name, MAX_NAME_LENGTH).trim(),
    color: color as ExportedCollection["color"],
    parentId:
      collection.parentId === null ? null : requireUuid(collection.parentId),
    sortOrder: requireInteger(collection.sortOrder),
    createdAt: requireDate(collection.createdAt),
  };
}

function parseTag(value: unknown): ExportedTag {
  const tag = requireRecord(value);
  return {
    id: requireUuid(tag.id),
    name: requireString(tag.name, MAX_NAME_LENGTH).trim(),
    createdAt: requireDate(tag.createdAt),
  };
}

function parseBookmark(value: unknown): ExportedBookmark {
  const bookmark = requireRecord(value);
  const url = normalizeImportedBookmarkUrl(
    requireString(bookmark.url, MAX_BOOKMARK_VALUE_LENGTH),
  );
  if (!url) throw invalidArchive();
  const isFavorite = requireBoolean(bookmark.isFavorite);
  const favoritedAt = requireNullableDate(bookmark.favoritedAt);
  if (isFavorite !== (favoritedAt !== null)) throw invalidArchive();
  return {
    id: requireUuid(bookmark.id),
    title: requireString(bookmark.title, MAX_BOOKMARK_VALUE_LENGTH).trim(),
    url,
    collectionIds: requireUuidArray(bookmark.collectionIds, MAX_COLLECTIONS),
    tagIds: requireUuidArray(bookmark.tagIds),
    isFavorite,
    favoritedAt,
    createdAt: requireDate(bookmark.createdAt),
  };
}

function parseListItem(value: unknown): ExportedListItem {
  const item = requireRecord(value);
  return {
    bookmarkId: requireUuid(item.bookmarkId),
    position: requireInteger(item.position),
    completedAt: requireNullableDate(item.completedAt),
    createdAt: requireDate(item.createdAt),
  };
}

function parseList(value: unknown): ExportedList {
  const list = requireRecord(value);
  const items = requireArray(list.items, MAX_LIST_ITEMS).map(parseListItem);
  if (new Set(items.map((item) => item.bookmarkId)).size !== items.length) {
    throw invalidArchive();
  }
  return {
    id: requireUuid(list.id),
    name: requireString(list.name, MAX_NAME_LENGTH).trim(),
    createdAt: requireDate(list.createdAt),
    updatedAt: requireDate(list.updatedAt),
    items,
  };
}

function parseEntry(value: unknown): ExportedEntry {
  const entry = requireRecord(value);
  const content = sanitizeEntryHtml(
    requireString(entry.content, MAX_ENTRY_CONTENT_LENGTH, true),
  );
  if (new TextEncoder().encode(content).byteLength > MAX_ENTRY_CONTENT_BYTES) {
    throw invalidArchive();
  }
  return {
    id: requireUuid(entry.id),
    title: requireString(entry.title, MAX_ENTRY_TITLE_LENGTH).trim(),
    content,
    collectionId:
      entry.collectionId === null ? null : requireUuid(entry.collectionId),
    tagIds: requireUuidArray(entry.tagIds),
    createdAt: requireDate(entry.createdAt),
    updatedAt: requireDate(entry.updatedAt),
  };
}

function parseTodo(value: unknown): ExportedTodo {
  const todo = requireRecord(value);
  const entry = parseEntry(todo);
  const isCompleted = requireBoolean(todo.isCompleted);
  const completedAt = requireNullableDate(todo.completedAt);
  if (isCompleted !== (completedAt !== null)) throw invalidArchive();
  const dueDate =
    todo.dueDate === null
      ? null
      : requireString(todo.dueDate, 10);
  if (dueDate !== null && !DUE_DATE_PATTERN.test(dueDate)) {
    throw invalidArchive();
  }
  return { ...entry, isCompleted, completedAt, dueDate };
}

function parseReadspaceEntry(value: unknown): ExportedEntry {
  const entry = parseEntry(value);
  const content = parseReadspaceContent(entry.content);
  if (!content) throw invalidArchive();
  const serializedContent = serializeReadspaceContent(content);
  if (
    new TextEncoder().encode(serializedContent).byteLength >
    MAX_READSPACE_CONTENT_BYTES
  ) {
    throw invalidArchive();
  }
  return { ...entry, content: serializedContent };
}

function validateRelationships(exported: FavLockExport): void {
  const collectionById = new Map(
    exported.data.collections.map((collection) => [collection.id, collection]),
  );
  const tagIds = new Set(exported.data.tags.map((tag) => tag.id));
  const bookmarkIds = new Set(
    (exported.data.bookmarks ?? []).map((bookmark) => bookmark.id),
  );

  for (const collection of exported.data.collections) {
    if (collection.parentId === null) continue;
    const parent = collectionById.get(collection.parentId);
    if (!parent || parent.parentId !== null || parent.id === collection.id) {
      throw invalidArchive();
    }
  }

  const validateItem = (item: {
    collectionId?: string | null;
    collectionIds?: string[];
    tagIds: string[];
  }) => {
    const collectionIds = item.collectionIds ??
      (item.collectionId ? [item.collectionId] : []);
    if (collectionIds.some((id) => !collectionById.has(id))) {
      throw invalidArchive();
    }
    if (item.tagIds.some((id) => !tagIds.has(id))) throw invalidArchive();
  };

  exported.data.bookmarks?.forEach(validateItem);
  exported.data.notes?.forEach(validateItem);
  exported.data.todos?.forEach(validateItem);
  exported.data.readspace?.forEach(validateItem);
  for (const list of exported.data.lists ?? []) {
    if (list.items.some((item) => !bookmarkIds.has(item.bookmarkId))) {
      throw invalidArchive();
    }
  }
}

function parseOptionalItems<T>(
  value: unknown,
  selected: boolean,
  maximum: number,
  parser: (item: unknown) => T,
): T[] | undefined {
  if (!selected) {
    if (value !== undefined) throw invalidArchive();
    return undefined;
  }
  if (value === undefined) throw invalidArchive();
  return requireArray(value, maximum).map(parser);
}

export function parseFavLockExport(value: unknown): FavLockExport {
  const archive = requireRecord(value);
  if (
    archive.format !== "favlock-export" ||
    archive.version !== 2 ||
    archive.encrypted !== false
  ) {
    throw invalidArchive();
  }

  const selection = parseSelection(archive.selection);
  const data = requireRecord(archive.data);
  const collections = requireArray(data.collections, MAX_COLLECTIONS).map(
    parseCollection,
  );
  const tags = requireArray(data.tags, MAX_TAGS).map(parseTag);
  const bookmarks = parseOptionalItems(
    data.bookmarks,
    selection.bookmarks,
    MAX_BOOKMARKS,
    parseBookmark,
  );
  const lists = data.lists === undefined
    ? undefined
    : requireArray(data.lists, MAX_LISTS).map(parseList);
  if (lists && !selection.bookmarks) throw invalidArchive();
  const notes = parseOptionalItems(
    data.notes,
    selection.notes,
    MAX_ENTRIES,
    parseEntry,
  );
  const todos = parseOptionalItems(
    data.todos,
    selection.todos,
    MAX_ENTRIES,
    parseTodo,
  );
  if ((notes?.length ?? 0) + (todos?.length ?? 0) > MAX_ENTRIES) {
    throw invalidArchive();
  }
  const readspace = parseOptionalItems(
    data.readspace,
    selection.readspace,
    MAX_READSPACE,
    parseReadspaceEntry,
  );

  requireUniqueIds(collections);
  requireUniqueIds(tags);
  if (bookmarks) requireUniqueIds(bookmarks);
  if (lists) requireUniqueIds(lists);
  if (notes) requireUniqueIds(notes);
  if (todos) requireUniqueIds(todos);
  if (readspace) requireUniqueIds(readspace);
  const entryIds = [
    ...(notes ?? []).map(({ id }) => id),
    ...(todos ?? []).map(({ id }) => id),
    ...(readspace ?? []).map(({ id }) => id),
  ];
  if (new Set(entryIds).size !== entryIds.length) throw invalidArchive();
  const migrationItemCount =
    collections.length +
    tags.length +
    (bookmarks?.length ?? 0) +
    entryIds.length +
    (lists?.length ?? 0) +
    (lists ?? []).reduce((count, list) => count + list.items.length, 0);
  if (migrationItemCount > MAX_MIGRATION_ITEMS) throw invalidArchive();

  const result: FavLockExport = {
    format: "favlock-export",
    version: 2,
    exportedAt: requireDate(archive.exportedAt),
    encrypted: false,
    selection,
    data: {
      collections,
      tags,
      ...(lists ? { lists } : {}),
      ...(bookmarks ? { bookmarks } : {}),
      ...(notes ? { notes } : {}),
      ...(todos ? { todos } : {}),
      ...(readspace ? { readspace } : {}),
    },
  };
  validateRelationships(result);
  return result;
}

export function summarizeFavLockExport(archive: FavLockExport) {
  return {
    collections: archive.data.collections.length,
    tags: archive.data.tags.length,
    bookmarks: archive.data.bookmarks?.length ?? 0,
    lists: archive.data.lists?.length ?? 0,
    notes: archive.data.notes?.length ?? 0,
    todos: archive.data.todos?.length ?? 0,
    readspace: archive.data.readspace?.length ?? 0,
  };
}
