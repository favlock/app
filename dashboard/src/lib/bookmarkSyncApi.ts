import {
  fetchAuthenticatedJson,
  postAuthenticatedJson,
} from "./authenticatedApi";

const SYNC_ERROR = "Could not synchronize your bookmarks.";
const REVISION_PATTERN = /^(0|[1-9][0-9]{0,18})$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 500;

export interface BookmarkSyncStatus {
  revision: string;
  deltaFloor: string;
}

export interface BookmarkSyncCursor {
  revision: string;
  bookmarkId: string;
}

export interface BookmarkSyncChange extends BookmarkSyncCursor {
  operation: "upsert" | "delete";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRevision(value: unknown): value is string {
  return typeof value === "string" && REVISION_PATTERN.test(value);
}

function parseCursor(value: unknown): BookmarkSyncCursor | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !isRevision(value.revision) ||
    typeof value.bookmarkId !== "string" ||
    !UUID_PATTERN.test(value.bookmarkId)
  ) {
    throw new Error(SYNC_ERROR);
  }
  return { revision: value.revision, bookmarkId: value.bookmarkId };
}

function parseChange(value: unknown): BookmarkSyncChange {
  const cursor = parseCursor(value);
  if (
    !cursor ||
    !isRecord(value) ||
    (value.operation !== "upsert" && value.operation !== "delete")
  ) {
    throw new Error(SYNC_ERROR);
  }
  return { ...cursor, operation: value.operation };
}

function parseStatus(value: unknown): BookmarkSyncStatus {
  if (!isRecord(value) || !isRecord(value.data)) throw new Error(SYNC_ERROR);
  const { revision, deltaFloor } = value.data;
  if (
    !isRevision(revision) ||
    !isRevision(deltaFloor) ||
    BigInt(deltaFloor) > BigInt(revision)
  ) {
    throw new Error(SYNC_ERROR);
  }
  return { revision, deltaFloor };
}

function parsePage(value: unknown): {
  resetRequired: boolean;
  changes: BookmarkSyncChange[];
  nextCursor: BookmarkSyncCursor | null;
} {
  if (!isRecord(value) || !isRecord(value.data)) throw new Error(SYNC_ERROR);
  const { resetRequired, changes, nextCursor } = value.data;
  if (
    typeof resetRequired !== "boolean" ||
    !Array.isArray(changes) ||
    changes.length > PAGE_SIZE
  ) {
    throw new Error(SYNC_ERROR);
  }
  return {
    resetRequired,
    changes: changes.map(parseChange),
    nextCursor: parseCursor(nextCursor),
  };
}

export async function fetchBookmarkSyncStatus(
  accessToken: string,
): Promise<BookmarkSyncStatus> {
  return parseStatus(
    await fetchAuthenticatedJson(
      "/v1/bookmarks/sync/status",
      accessToken,
      SYNC_ERROR,
    ),
  );
}

export async function fetchBookmarkSyncChanges(
  accessToken: string,
  afterRevision: string,
  throughRevision: string,
): Promise<BookmarkSyncChange[]> {
  if (
    !isRevision(afterRevision) ||
    !isRevision(throughRevision) ||
    BigInt(throughRevision) < BigInt(afterRevision)
  ) {
    throw new Error(SYNC_ERROR);
  }

  const changes: BookmarkSyncChange[] = [];
  const seenCursors = new Set<string>();
  let cursor: BookmarkSyncCursor | null = null;
  for (;;) {
    const page = parsePage(
      await postAuthenticatedJson(
        "/v1/bookmarks/sync/changes",
        accessToken,
        { afterRevision, throughRevision, cursor, limit: PAGE_SIZE },
        SYNC_ERROR,
      ),
    );
    if (page.resetRequired) {
      if (page.changes.length > 0 || page.nextCursor !== null) {
        throw new Error(SYNC_ERROR);
      }
      throw new Error("Bookmark sync reset required.");
    }
    if (
      page.changes.some(
        (change) =>
          BigInt(change.revision) <= BigInt(afterRevision) ||
          BigInt(change.revision) > BigInt(throughRevision),
      )
    ) {
      throw new Error(SYNC_ERROR);
    }
    changes.push(...page.changes);
    if (!page.nextCursor) return changes;
    const last = page.changes.at(-1);
    if (
      !last ||
      last.revision !== page.nextCursor.revision ||
      last.bookmarkId !== page.nextCursor.bookmarkId
    ) {
      throw new Error(SYNC_ERROR);
    }
    const key = `${page.nextCursor.revision}:${page.nextCursor.bookmarkId}`;
    if (seenCursors.has(key)) throw new Error(SYNC_ERROR);
    seenCursors.add(key);
    cursor = page.nextCursor;
  }
}
