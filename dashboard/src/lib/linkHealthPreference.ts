export const LINK_HEALTH_SCAN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1_000;

export interface LinkHealthDeviceState {
  automaticScanEnabled: boolean;
  brokenCount: number;
  lastScanAt: string | null;
  nextScanAt: string | null;
  scanInProgress: boolean;
  scanPaused: boolean;
  scanStartedAt: string | null;
  scannedCount: number;
  totalCount: number;
}

const DEFAULT_STATE: LinkHealthDeviceState = {
  automaticScanEnabled: false,
  brokenCount: 0,
  lastScanAt: null,
  nextScanAt: null,
  scanInProgress: false,
  scanPaused: false,
  scanStartedAt: null,
  scannedCount: 0,
  totalCount: 0,
};

function storageKey(userId: string): string {
  return `favlock.link-health.v1.${userId}`;
}

function safeCount(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : 0;
}

function safeDate(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

export function readLinkHealthState(userId: string): LinkHealthDeviceState {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(storageKey(userId)) ?? "null",
    ) as Partial<LinkHealthDeviceState> | null;
    return {
      automaticScanEnabled: parsed?.automaticScanEnabled === true,
      brokenCount: safeCount(parsed?.brokenCount),
      lastScanAt: safeDate(parsed?.lastScanAt),
      nextScanAt: safeDate(parsed?.nextScanAt),
      scanInProgress: parsed?.scanInProgress === true,
      scanPaused: parsed?.scanPaused === true,
      scanStartedAt: safeDate(parsed?.scanStartedAt),
      scannedCount: safeCount(parsed?.scannedCount),
      totalCount: safeCount(parsed?.totalCount),
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeLinkHealthState(
  userId: string,
  state: LinkHealthDeviceState,
): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // The scan remains usable when preferences cannot be persisted.
  }
}

export function isLinkHealthScanDue(
  state: LinkHealthDeviceState,
  now = Date.now(),
): boolean {
  if (!state.automaticScanEnabled) return false;
  if (state.scanPaused) return false;
  if (state.scanInProgress && state.scanStartedAt) return true;
  if (!state.nextScanAt) return true;
  return now >= Date.parse(state.nextScanAt);
}

export function nextLinkHealthScanAt(completedAt: string): string {
  return new Date(
    Date.parse(completedAt) + LINK_HEALTH_SCAN_INTERVAL_MS,
  ).toISOString();
}
