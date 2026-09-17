import type { DuplicateMatchMode } from "./bookmarkDuplicates";

export const DUPLICATE_SCAN_INTERVAL_MS = 24 * 60 * 60 * 1_000;

export interface PersistedDuplicateGroup {
  keeperId: string;
  duplicateIds: string[];
}

export interface DuplicateScanDeviceState {
  dailyScanEnabled: boolean;
  duplicateCount: number;
  duplicateGroups: PersistedDuplicateGroup[];
  lastScanAt: string | null;
  lastScanMatchMode: DuplicateMatchMode | null;
  matchMode: DuplicateMatchMode;
  nextScanAt: string | null;
  scanInProgress: boolean;
  scannedCount: number;
  totalCount: number;
}

const DEFAULT_STATE: DuplicateScanDeviceState = {
  dailyScanEnabled: true,
  duplicateCount: 0,
  duplicateGroups: [],
  lastScanAt: null,
  lastScanMatchMode: null,
  matchMode: "tracking",
  nextScanAt: null,
  scanInProgress: false,
  scannedCount: 0,
  totalCount: 0,
};

function storageKey(userId: string): string {
  return `favlock.duplicate-scan.v1.${userId}`;
}

function safeCount(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : 0;
}

function safeGroups(value: unknown): PersistedDuplicateGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((group) => {
    if (
      !group ||
      typeof group !== "object" ||
      !("keeperId" in group) ||
      typeof group.keeperId !== "string" ||
      !("duplicateIds" in group) ||
      !Array.isArray(group.duplicateIds) ||
      !group.duplicateIds.every((id: unknown) => typeof id === "string")
    ) {
      return [];
    }
    return [{ keeperId: group.keeperId, duplicateIds: group.duplicateIds }];
  });
}

export function readDuplicateScanState(
  userId: string,
): DuplicateScanDeviceState {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(storageKey(userId)) ?? "null",
    ) as Partial<DuplicateScanDeviceState> | null;
    const matchMode = parsed?.matchMode;
    const validMatchMode =
      matchMode === "exact" || matchMode === "tracking" || matchMode === "query"
        ? matchMode
        : DEFAULT_STATE.matchMode;
    const lastScanAt =
      typeof parsed?.lastScanAt === "string" ? parsed.lastScanAt : null;
    const lastScanMatchMode = parsed?.lastScanMatchMode;

    return {
      dailyScanEnabled:
        typeof parsed?.dailyScanEnabled === "boolean"
          ? parsed.dailyScanEnabled
          : DEFAULT_STATE.dailyScanEnabled,
      duplicateCount: safeCount(parsed?.duplicateCount),
      duplicateGroups: safeGroups(parsed?.duplicateGroups),
      lastScanAt,
      lastScanMatchMode:
        lastScanMatchMode === "exact" ||
        lastScanMatchMode === "tracking" ||
        lastScanMatchMode === "query"
          ? lastScanMatchMode
          : lastScanAt
            ? validMatchMode
            : null,
      matchMode: validMatchMode,
      nextScanAt:
        typeof parsed?.nextScanAt === "string" ? parsed.nextScanAt : null,
      scanInProgress: parsed?.scanInProgress === true,
      scannedCount: safeCount(parsed?.scannedCount),
      totalCount: safeCount(parsed?.totalCount),
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeDuplicateScanState(
  userId: string,
  state: DuplicateScanDeviceState,
): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // Scanning still works when storage is unavailable; only preferences reset.
  }
}

export function isDailyDuplicateScanDue(
  state: DuplicateScanDeviceState,
  now = Date.now(),
): boolean {
  if (!state.dailyScanEnabled) return false;
  if (state.scanInProgress) return true;
  if (!state.nextScanAt) return true;

  const nextScanAt = Date.parse(state.nextScanAt);
  return !Number.isFinite(nextScanAt) || now >= nextScanAt;
}

export function nextDuplicateScanAt(completedAt: string): string {
  return new Date(
    Date.parse(completedAt) + DUPLICATE_SCAN_INTERVAL_MS,
  ).toISOString();
}
