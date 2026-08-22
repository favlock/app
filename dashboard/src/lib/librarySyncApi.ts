import {
  fetchAuthenticatedJson,
  postAuthenticatedJson,
} from "./authenticatedApi";

const SYNC_ERROR = "Could not synchronize your library.";
const REVISION_PATTERN = /^(0|[1-9][0-9]{0,18})$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 500;

export type LibrarySyncResourceType = "entry" | "folder" | "tag" | "trash";
export type LibrarySyncOperation = "upsert" | "delete";

export interface LibrarySyncStatus {
  revision: string;
  deltaFloor: string;
}

export interface LibrarySyncCursor {
  revision: string;
  resourceType: LibrarySyncResourceType;
  resourceId: string;
}

export interface LibrarySyncChange extends LibrarySyncCursor {
  operation: LibrarySyncOperation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRevision(value: unknown): value is string {
  return typeof value === "string" && REVISION_PATTERN.test(value);
}

function isResourceType(value: unknown): value is LibrarySyncResourceType {
  return (
    value === "entry" || value === "folder" || value === "tag" || value === "trash"
  );
}

function isOperation(value: unknown): value is LibrarySyncOperation {
  return value === "upsert" || value === "delete";
}

function parseCursor(value: unknown): LibrarySyncCursor | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !isRevision(value.revision) ||
    !isResourceType(value.resourceType) ||
    typeof value.resourceId !== "string" ||
    !UUID_PATTERN.test(value.resourceId)
  ) {
    throw new Error(SYNC_ERROR);
  }
  return {
    revision: value.revision,
    resourceType: value.resourceType,
    resourceId: value.resourceId,
  };
}

function parseChange(value: unknown): LibrarySyncChange {
  const cursor = parseCursor(value);
  if (!cursor || !isRecord(value) || !isOperation(value.operation)) {
    throw new Error(SYNC_ERROR);
  }
  return { ...cursor, operation: value.operation };
}

function parseStatus(value: unknown): LibrarySyncStatus {
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
  changes: LibrarySyncChange[];
  nextCursor: LibrarySyncCursor | null;
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

function cursorKey(cursor: LibrarySyncCursor): string {
  return `${cursor.revision}:${cursor.resourceType}:${cursor.resourceId}`;
}

export async function fetchLibrarySyncStatus(
  accessToken: string,
): Promise<LibrarySyncStatus> {
  return parseStatus(
    await fetchAuthenticatedJson(
      "/v1/library/sync/status",
      accessToken,
      SYNC_ERROR,
    ),
  );
}

export async function fetchLibrarySyncChanges(
  accessToken: string,
  afterRevision: string,
  throughRevision: string,
): Promise<LibrarySyncChange[]> {
  if (
    !isRevision(afterRevision) ||
    !isRevision(throughRevision) ||
    BigInt(throughRevision) < BigInt(afterRevision)
  ) {
    throw new Error(SYNC_ERROR);
  }

  const changes: LibrarySyncChange[] = [];
  const seenCursors = new Set<string>();
  let cursor: LibrarySyncCursor | null = null;
  for (;;) {
    const page = parsePage(
      await postAuthenticatedJson(
        "/v1/library/sync/changes",
        accessToken,
        { afterRevision, throughRevision, cursor, limit: PAGE_SIZE },
        SYNC_ERROR,
      ),
    );
    if (page.resetRequired) {
      if (page.changes.length > 0 || page.nextCursor !== null) {
        throw new Error(SYNC_ERROR);
      }
      throw new Error("Library sync reset required.");
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
    if (!last || cursorKey(page.nextCursor) !== cursorKey(last)) {
      throw new Error(SYNC_ERROR);
    }
    const key = cursorKey(page.nextCursor);
    if (seenCursors.has(key)) throw new Error(SYNC_ERROR);
    seenCursors.add(key);
    cursor = page.nextCursor;
  }
}
