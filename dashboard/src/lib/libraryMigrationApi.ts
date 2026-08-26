import {
  deleteAuthenticatedWithoutResponse,
  postAuthenticatedJson,
  putAuthenticatedJsonWithoutResponse,
} from "./authenticatedApi";
import type { FavLockExport } from "./dataExport";
import { encryptField, VERIFY_CONSTANT } from "./encryption";

const MIGRATION_BATCH_ITEM_LIMIT = 500;
const MIGRATION_BATCH_MAX_BYTES = 450_000;

export type EncryptedMigrationItem =
  | {
      type: "collection";
      id: string;
      encryptedName: string;
      color: string | null;
      parentId: string | null;
      sortOrder: number;
      createdAt: string;
    }
  | {
      type: "tag";
      id: string;
      encryptedName: string;
      createdAt: string;
    }
  | {
      type: "list";
      id: string;
      encryptedName: string;
      createdAt: string;
      updatedAt: string;
    }
  | {
      type: "listItem";
      id: string;
      listId: string;
      bookmarkId: string;
      position: number;
      completedAt: string | null;
      createdAt: string;
    }
  | {
      type: "bookmark";
      id: string;
      encryptedTitle: string;
      encryptedUrl: string;
      collectionIds: string[];
      tagIds: string[];
      isFavorite: boolean;
      favoritedAt: string | null;
      createdAt: string;
    }
  | {
      type: "entry";
      id: string;
      kind: "note" | "todo" | "read";
      encryptedTitle: string;
      encryptedContent: string;
      collectionId: string | null;
      tagIds: string[];
      isCompleted: boolean;
      completedAt: string | null;
      dueDate: string | null;
      createdAt: string;
      updatedAt: string;
    };

type EncryptField = (value: string) => Promise<string>;

function bodySize(items: EncryptedMigrationItem[]): number {
  return new TextEncoder().encode(JSON.stringify({ items })).byteLength;
}

export function batchEncryptedMigrationItems(
  items: EncryptedMigrationItem[],
): EncryptedMigrationItem[][] {
  const batches: EncryptedMigrationItem[][] = [];
  let current: EncryptedMigrationItem[] = [];
  for (const item of items) {
    const candidate = [...current, item];
    if (
      candidate.length > MIGRATION_BATCH_ITEM_LIMIT ||
      bodySize(candidate) > MIGRATION_BATCH_MAX_BYTES
    ) {
      if (current.length === 0) {
        throw new Error("One item in this archive is too large to migrate.");
      }
      batches.push(current);
      current = [item];
      if (bodySize(current) > MIGRATION_BATCH_MAX_BYTES) {
        throw new Error("One item in this archive is too large to migrate.");
      }
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) batches.push(current);
  if (batches.length === 0) {
    throw new Error("This archive does not contain any data to migrate.");
  }
  if (batches.length > 250) {
    throw new Error("This archive contains too much data to migrate at once.");
  }
  return batches;
}

export async function prepareEncryptedMigrationItems(
  archive: FavLockExport,
  encryptField: EncryptField,
): Promise<EncryptedMigrationItem[]> {
  const items: EncryptedMigrationItem[] = [];
  const collectionIds = new Map(
    archive.data.collections.map(({ id }) => [id, crypto.randomUUID()]),
  );
  const tagIds = new Map(
    archive.data.tags.map(({ id }) => [id, crypto.randomUUID()]),
  );
  const bookmarkIds = new Map(
    (archive.data.bookmarks ?? []).map(({ id }) => [id, crypto.randomUUID()]),
  );
  const listIds = new Map(
    (archive.data.lists ?? []).map(({ id }) => [id, crypto.randomUUID()]),
  );
  const entryIds = new Map(
    [
      ...(archive.data.notes ?? []),
      ...(archive.data.todos ?? []),
      ...(archive.data.readspace ?? []),
    ].map(({ id }) => [id, crypto.randomUUID()]),
  );
  const mappedId = (ids: Map<string, string>, sourceId: string): string => {
    const destinationId = ids.get(sourceId);
    if (!destinationId) {
      throw new Error("The archive contains an invalid relationship.");
    }
    return destinationId;
  };
  for (const collection of archive.data.collections) {
    items.push({
      type: "collection",
      id: mappedId(collectionIds, collection.id),
      encryptedName: await encryptField(collection.name),
      color: collection.color,
      parentId: collection.parentId
        ? mappedId(collectionIds, collection.parentId)
        : null,
      sortOrder: collection.sortOrder,
      createdAt: collection.createdAt,
    });
  }
  for (const tag of archive.data.tags) {
    items.push({
      type: "tag",
      id: mappedId(tagIds, tag.id),
      encryptedName: await encryptField(tag.name),
      createdAt: tag.createdAt,
    });
  }
  for (const list of archive.data.lists ?? []) {
    items.push({
      type: "list",
      id: mappedId(listIds, list.id),
      encryptedName: await encryptField(list.name),
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
    });
  }
  for (const bookmark of archive.data.bookmarks ?? []) {
    items.push({
      type: "bookmark",
      id: mappedId(bookmarkIds, bookmark.id),
      encryptedTitle: await encryptField(bookmark.title),
      encryptedUrl: await encryptField(bookmark.url),
      collectionIds: bookmark.collectionIds.map((id) =>
        mappedId(collectionIds, id)),
      tagIds: bookmark.tagIds.map((id) => mappedId(tagIds, id)),
      isFavorite: bookmark.isFavorite,
      favoritedAt: bookmark.favoritedAt,
      createdAt: bookmark.createdAt,
    });
  }
  const addEntries = async (
    entries: NonNullable<FavLockExport["data"]["notes"]>,
    kind: "note" | "read",
  ) => {
    for (const entry of entries) {
      items.push({
        type: "entry",
        id: mappedId(entryIds, entry.id),
        kind,
        encryptedTitle: await encryptField(entry.title),
        encryptedContent: await encryptField(entry.content),
        collectionId: entry.collectionId
          ? mappedId(collectionIds, entry.collectionId)
          : null,
        tagIds: entry.tagIds.map((id) => mappedId(tagIds, id)),
        isCompleted: false,
        completedAt: null,
        dueDate: null,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      });
    }
  };
  await addEntries(archive.data.notes ?? [], "note");
  for (const todo of archive.data.todos ?? []) {
    items.push({
      type: "entry",
      id: mappedId(entryIds, todo.id),
      kind: "todo",
      encryptedTitle: await encryptField(todo.title),
      encryptedContent: await encryptField(todo.content),
      collectionId: todo.collectionId
        ? mappedId(collectionIds, todo.collectionId)
        : null,
      tagIds: todo.tagIds.map((id) => mappedId(tagIds, id)),
      isCompleted: todo.isCompleted,
      completedAt: todo.completedAt,
      dueDate: todo.dueDate,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
    });
  }
  await addEntries(archive.data.readspace ?? [], "read");
  for (const list of archive.data.lists ?? []) {
    for (const item of list.items) {
      items.push({
        type: "listItem",
        id: crypto.randomUUID(),
        listId: mappedId(listIds, list.id),
        bookmarkId: mappedId(bookmarkIds, item.bookmarkId),
        position: item.position,
        completedAt: item.completedAt,
        createdAt: item.createdAt,
      });
    }
  }
  return items;
}

function isStatus(value: unknown, migrationId: string, status: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = (value as { data?: unknown }).data;
  return !!data && typeof data === "object" && !Array.isArray(data) &&
    (data as { migrationId?: unknown }).migrationId === migrationId &&
    (data as { status?: unknown }).status === status;
}

export async function migrateFavLockArchive(
  archive: FavLockExport,
  accessToken: string,
  encryptionKey: CryptoKey,
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  const encryptWithMigratedKey = (value: string) =>
    encryptField(value, encryptionKey);
  const items = await prepareEncryptedMigrationItems(
    archive,
    encryptWithMigratedKey,
  );
  const batches = batchEncryptedMigrationItems(items);
  const verifier = await encryptWithMigratedKey(VERIFY_CONSTANT);
  const migrationId = crypto.randomUUID();
  let began = false;
  try {
    const begin = await postAuthenticatedJson(
      "/v1/account/migrations",
      accessToken,
      { migrationId, expectedBatchCount: batches.length },
      "Could not start the account migration.",
    );
    if (isStatus(begin, migrationId, "completed")) return;
    if (!isStatus(begin, migrationId, "staging")) {
      throw new Error("Could not start the account migration.");
    }
    began = true;
    onProgress?.(0, batches.length);
    for (const [index, batch] of batches.entries()) {
      await putAuthenticatedJsonWithoutResponse(
        `/v1/account/migrations/${migrationId}/batches/${index}`,
        accessToken,
        { items: batch },
        "Could not upload the encrypted migration data.",
      );
      onProgress?.(index + 1, batches.length);
    }
    const completed = await postAuthenticatedJson(
      `/v1/account/migrations/${migrationId}/complete`,
      accessToken,
      { verifier },
      "Could not complete the migration. Make sure this account has an empty library.",
    );
    if (!isStatus(completed, migrationId, "completed")) {
      throw new Error("Could not confirm the completed migration.");
    }
  } catch (error) {
    if (began) {
      await deleteAuthenticatedWithoutResponse(
        `/v1/account/migrations/${migrationId}`,
        accessToken,
        "Could not cancel the migration.",
      ).catch(() => undefined);
    }
    throw error;
  }
}
