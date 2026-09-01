import { decryptFieldStrict, encryptField, ENC_PREFIX } from "./encryption";

export const IMPORT_RECOVERY_VERSION = 1 as const;
const STORAGE_PREFIX = "favlock:bookmark-import-recovery:v1:";
const MAX_ITEMS = 100_000;
const STATE_CODES = new Set(["p", "a", "d", "o", "i", "f", "u"]);

export type ImportItemState =
  | "pending"
  | "added"
  | "duplicate"
  | "overwritten"
  | "invalid"
  | "failed"
  | "unknown";
export type ImportDuplicateResolution = "skip" | "keep" | "overwrite";

export type ImportRecoveryDecision = {
  index: number;
  resolution: ImportDuplicateResolution;
  existingBookmarkId: string;
};

export type ImportRecoveryInFlight = {
  kind: "create" | "overwrite-content" | "move-folder" | "create-folder";
  index: number;
  existingIds?: string[];
  bookmarkId?: string;
  folderKey?: string;
};

export type ImportRecoveryJournal = {
  version: typeof IMPORT_RECOVERY_VERSION;
  userId: string;
  operationId: string;
  sourceFingerprint: string;
  sourceKind: "html" | "safari-zip" | "chrome";
  itemCount: number;
  states: string;
  decisions: ImportRecoveryDecision[];
  folderIds: Array<[string, string]>;
  inFlight: ImportRecoveryInFlight[];
  startedAt: string;
  updatedAt: string;
};

const stateToCode: Record<ImportItemState, string> = {
  pending: "p",
  added: "a",
  duplicate: "d",
  overwritten: "o",
  invalid: "i",
  failed: "f",
  unknown: "u",
};

const codeToState: Record<string, ImportItemState> = {
  p: "pending",
  a: "added",
  d: "duplicate",
  o: "overwritten",
  i: "invalid",
  f: "failed",
  u: "unknown",
};

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseJournal(value: unknown, expectedUserId: string): ImportRecoveryJournal | null {
  if (!isRecord(value)) return null;
  const itemCount = value.itemCount;
  if (
    value.version !== IMPORT_RECOVERY_VERSION ||
    value.userId !== expectedUserId ||
    !isUuid(value.operationId) ||
    typeof value.sourceFingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.sourceFingerprint) ||
    !["html", "safari-zip", "chrome"].includes(String(value.sourceKind)) ||
    !Number.isSafeInteger(itemCount) ||
    (itemCount as number) < 1 ||
    (itemCount as number) > MAX_ITEMS ||
    typeof value.states !== "string" ||
    value.states.length !== itemCount ||
    [...value.states].some((code) => !STATE_CODES.has(code)) ||
    !Array.isArray(value.decisions) ||
    value.decisions.length > itemCount ||
    !Array.isArray(value.folderIds) ||
    value.folderIds.length > itemCount * 2 ||
    !Array.isArray(value.inFlight) ||
    value.inFlight.length > 8 ||
    !isTimestamp(value.startedAt) ||
    !isTimestamp(value.updatedAt)
  ) {
    return null;
  }

  const decisions: ImportRecoveryDecision[] = [];
  for (const decision of value.decisions) {
    if (
      !isRecord(decision) ||
      !Number.isSafeInteger(decision.index) ||
      (decision.index as number) < 0 ||
      (decision.index as number) >= itemCount ||
      !["skip", "keep", "overwrite"].includes(String(decision.resolution)) ||
      !isUuid(decision.existingBookmarkId)
    ) {
      return null;
    }
    decisions.push(decision as ImportRecoveryDecision);
  }

  const folderIds: Array<[string, string]> = [];
  for (const entry of value.folderIds) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== "string" ||
      entry[0].length > 2_000 ||
      !isUuid(entry[1])
    ) {
      return null;
    }
    folderIds.push([entry[0], entry[1]]);
  }

  const inFlight: ImportRecoveryInFlight[] = [];
  for (const entry of value.inFlight) {
    if (
      !isRecord(entry) ||
      !["create", "overwrite-content", "move-folder", "create-folder"].includes(
        String(entry.kind),
      ) ||
      !Number.isSafeInteger(entry.index) ||
      (entry.index as number) < 0 ||
      (entry.index as number) >= itemCount
    ) {
      return null;
    }
    if (
      entry.existingIds !== undefined &&
      (!Array.isArray(entry.existingIds) ||
        entry.existingIds.length > 100 ||
        !entry.existingIds.every(isUuid))
    ) {
      return null;
    }
    if (entry.bookmarkId !== undefined && !isUuid(entry.bookmarkId)) return null;
    if (
      entry.folderKey !== undefined &&
      (typeof entry.folderKey !== "string" || entry.folderKey.length > 2_000)
    ) {
      return null;
    }
    inFlight.push(entry as ImportRecoveryInFlight);
  }

  return {
    ...(value as unknown as ImportRecoveryJournal),
    decisions,
    folderIds,
    inFlight,
  };
}

export function createImportRecoveryJournal(
  userId: string,
  sourceFingerprint: string,
  sourceKind: ImportRecoveryJournal["sourceKind"],
  itemCount: number,
): ImportRecoveryJournal {
  if (!userId || itemCount < 1 || itemCount > MAX_ITEMS) {
    throw new Error("This import cannot be prepared for safe recovery.");
  }
  const now = new Date().toISOString();
  return {
    version: IMPORT_RECOVERY_VERSION,
    userId,
    operationId: crypto.randomUUID(),
    sourceFingerprint,
    sourceKind,
    itemCount,
    states: "p".repeat(itemCount),
    decisions: [],
    folderIds: [],
    inFlight: [],
    startedAt: now,
    updatedAt: now,
  };
}

export function getImportItemState(
  journal: ImportRecoveryJournal,
  index: number,
): ImportItemState {
  return codeToState[journal.states[index]] ?? "unknown";
}

export function setImportItemState(
  journal: ImportRecoveryJournal,
  index: number,
  state: ImportItemState,
): ImportRecoveryJournal {
  if (index < 0 || index >= journal.itemCount) return journal;
  return {
    ...journal,
    states:
      journal.states.slice(0, index) +
      stateToCode[state] +
      journal.states.slice(index + 1),
    updatedAt: new Date().toISOString(),
  };
}

export function summarizeImportRecovery(journal: ImportRecoveryJournal) {
  const states = [...journal.states].map((code) => codeToState[code]);
  const added = states.filter((state) => state === "added").length;
  const duplicate = states.filter((state) => state === "duplicate").length;
  const overwritten = states.filter((state) => state === "overwritten").length;
  const invalid = states.filter((state) => state === "invalid").length;
  const failed = states.filter((state) => state === "failed").length;
  const unknownIndices = new Set(
    states.flatMap((state, index) => state === "unknown" ? [index] : []),
  );
  for (const operation of journal.inFlight) {
    if (operation.kind !== "create-folder") unknownIndices.add(operation.index);
  }
  const unknown = unknownIndices.size;
  const remaining = states.filter((state) => state === "pending").length;
  return { added, duplicate, overwritten, invalid, failed, unknown, remaining };
}

export async function saveImportRecoveryJournal(
  journal: ImportRecoveryJournal,
  key: CryptoKey,
  assertCurrent?: () => void,
): Promise<void> {
  assertCurrent?.();
  const encrypted = await encryptField(JSON.stringify(journal), key);
  assertCurrent?.();
  window.localStorage.setItem(storageKey(journal.userId), encrypted);
}

export async function readImportRecoveryJournal(
  userId: string,
  key: CryptoKey,
): Promise<ImportRecoveryJournal | null> {
  const stored = window.localStorage.getItem(storageKey(userId));
  if (!stored?.startsWith(ENC_PREFIX)) return null;
  try {
    return parseJournal(JSON.parse(await decryptFieldStrict(stored, key)), userId);
  } catch {
    return null;
  }
}

export function clearImportRecoveryJournal(userId: string): void {
  window.localStorage.removeItem(storageKey(userId));
}
