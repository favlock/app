import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./useAuth";
import { useEncryption } from "./useEncryption";
import { getCachedBookmarksForUser } from "../lib/bookmarkCache";
import {
  countDuplicateBookmarks,
  findBookmarkDuplicateGroups,
  findBookmarkDuplicateGroupsInBatches,
  type BookmarkDuplicateGroup,
  type DuplicateMatchMode,
} from "../lib/bookmarkDuplicates";
import {
  isDailyDuplicateScanDue,
  nextDuplicateScanAt,
  readDuplicateScanState,
  writeDuplicateScanState,
  type DuplicateScanDeviceState,
} from "../lib/duplicateScanPreference";
import { readLocalBookmarks } from "../lib/localVault";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";

export type DuplicateScanPhase = "idle" | "scanning" | "complete" | "error";

interface DuplicateScanContextValue {
  applyCleanup: (keeperIds: string[], removedCount: number) => void;
  canScan: boolean;
  deviceState: DuplicateScanDeviceState;
  error: string | null;
  groups: BookmarkDuplicateGroup[] | null;
  loadStoredGroups: () => Promise<void>;
  phase: DuplicateScanPhase;
  runId: number;
  scanNow: () => Promise<void>;
  setDailyScanEnabled: (enabled: boolean) => void;
  setMatchMode: (mode: DuplicateMatchMode) => void;
}

const EMPTY_STATE: DuplicateScanDeviceState = {
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

// eslint-disable-next-line react-refresh/only-export-components
export const DuplicateScanContext = createContext<
  DuplicateScanContextValue | undefined
>(undefined);

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function DuplicateScanProvider({ children }: { children: ReactNode }) {
  const {
    bookmarkCacheSyncedAt,
    bookmarkCacheSyncing,
    isLocalAccount,
    libraryCacheHydrating,
    user,
  } = useAuth();
  const userId = user?.id ?? null;
  const { cryptoKey } = useEncryption();
  const { data: accountPlan } = useAccountPlan();
  const hasPro = accountPlan?.id === "pro";
  const [deviceState, setDeviceState] =
    useState<DuplicateScanDeviceState>(EMPTY_STATE);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [groups, setGroups] = useState<BookmarkDuplicateGroup[] | null>(null);
  const [phase, setPhase] = useState<DuplicateScanPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const activeScanRef = useRef<AbortController | null>(null);
  const suppressImmediateScheduledScanRef = useRef(false);
  const canScan = Boolean(
    userId &&
      hasPro &&
      loadedUserId === userId &&
      cryptoKey &&
      bookmarkCacheSyncedAt &&
      !bookmarkCacheSyncing &&
      !libraryCacheHydrating,
  );

  useEffect(() => {
    activeScanRef.current?.abort();
    activeScanRef.current = null;
    setGroups(null);
    setPhase("idle");
    setError(null);

    if (!userId) {
      setDeviceState(EMPTY_STATE);
      setLoadedUserId(null);
      return;
    }

    setDeviceState(readDuplicateScanState(userId));
    setLoadedUserId(userId);
  }, [userId]);

  useEffect(
    () => () => {
      activeScanRef.current?.abort();
    },
    [],
  );

  const updateDeviceState = useCallback(
    (
      update: (
        current: DuplicateScanDeviceState,
      ) => DuplicateScanDeviceState,
    ) => {
      setDeviceState((current) => {
        const next = update(current);
        if (userId) writeDuplicateScanState(userId, next);
        return next;
      });
    },
    [userId],
  );

  const scanNow = useCallback(async () => {
    if (
      !userId ||
      !hasPro ||
      loadedUserId !== userId ||
      !cryptoKey ||
      !bookmarkCacheSyncedAt ||
      bookmarkCacheSyncing ||
      libraryCacheHydrating ||
      activeScanRef.current
    ) {
      return;
    }

    const controller = new AbortController();
    activeScanRef.current = controller;
    setRunId((current) => current + 1);
    setPhase("scanning");
    setError(null);
    updateDeviceState((current) => ({
      ...current,
      scanInProgress: true,
      scannedCount: 0,
      totalCount: 0,
    }));

    try {
      const bookmarks = (
        isLocalAccount
          ? await readLocalBookmarks(userId, cryptoKey)
          : await getCachedBookmarksForUser(userId)
      ).filter((bookmark) => !bookmark.is_highlight_source);

      updateDeviceState((current) => ({
        ...current,
        scanInProgress: true,
        scannedCount: 0,
        totalCount: bookmarks.length,
      }));

      const nextGroups = await findBookmarkDuplicateGroupsInBatches(
        bookmarks,
        deviceState.matchMode,
        (scannedCount, totalCount) => {
          updateDeviceState((current) => ({
            ...current,
            scanInProgress: true,
            scannedCount,
            totalCount,
          }));
        },
        controller.signal,
      );
      const completedAt = new Date().toISOString();
      const duplicateCount = countDuplicateBookmarks(nextGroups);

      setGroups(nextGroups);
      updateDeviceState((current) => ({
        ...current,
        duplicateCount,
        duplicateGroups: nextGroups.map((group) => ({
          keeperId: group.keeper.id,
          duplicateIds: group.duplicates.map((bookmark) => bookmark.id),
        })),
        lastScanAt: completedAt,
        lastScanMatchMode: deviceState.matchMode,
        nextScanAt: nextDuplicateScanAt(completedAt),
        scanInProgress: false,
        scannedCount: bookmarks.length,
        totalCount: bookmarks.length,
      }));
      setPhase("complete");
    } catch (scanError) {
      if (isAbortError(scanError)) return;
      updateDeviceState((current) => ({
        ...current,
        scanInProgress: false,
      }));
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Could not scan bookmarks for duplicates.",
      );
      setPhase("error");
    } finally {
      if (activeScanRef.current === controller) {
        activeScanRef.current = null;
      }
    }
  }, [
    bookmarkCacheSyncedAt,
    bookmarkCacheSyncing,
    cryptoKey,
    deviceState.matchMode,
    hasPro,
    isLocalAccount,
    libraryCacheHydrating,
    loadedUserId,
    updateDeviceState,
    userId,
  ]);

  const loadStoredGroups = useCallback(async () => {
    if (
      groups !== null ||
      !hasPro ||
      deviceState.duplicateGroups.length === 0 ||
      !userId ||
      !cryptoKey ||
      !bookmarkCacheSyncedAt ||
      bookmarkCacheSyncing ||
      libraryCacheHydrating
    ) {
      return;
    }

    const storedIds = new Set(
      deviceState.duplicateGroups.flatMap((group) => [
        group.keeperId,
        ...group.duplicateIds,
      ]),
    );
    const bookmarks = (
      isLocalAccount
        ? await readLocalBookmarks(userId, cryptoKey)
        : await getCachedBookmarksForUser(userId)
    ).filter((bookmark) => storedIds.has(bookmark.id));
    const restoredGroups = findBookmarkDuplicateGroups(
      bookmarks,
      deviceState.lastScanMatchMode ?? deviceState.matchMode,
    );
    setGroups(restoredGroups);
    updateDeviceState((current) => ({
      ...current,
      duplicateCount: countDuplicateBookmarks(restoredGroups),
      duplicateGroups: restoredGroups.map((group) => ({
        keeperId: group.keeper.id,
        duplicateIds: group.duplicates.map((bookmark) => bookmark.id),
      })),
    }));
  }, [
    bookmarkCacheSyncedAt,
    bookmarkCacheSyncing,
    cryptoKey,
    deviceState.duplicateGroups,
    deviceState.lastScanMatchMode,
    deviceState.matchMode,
    groups,
    hasPro,
    isLocalAccount,
    libraryCacheHydrating,
    updateDeviceState,
    userId,
  ]);

  useEffect(() => {
    if (loadedUserId !== userId || phase === "scanning" || !canScan) return;
    const suppressImmediateScan = suppressImmediateScheduledScanRef.current;
    suppressImmediateScheduledScanRef.current = false;
    if (isDailyDuplicateScanDue(deviceState)) {
      if (!suppressImmediateScan) void scanNow();
      return;
    }
    if (!deviceState.dailyScanEnabled || !deviceState.nextScanAt) return;

    const delay = Math.min(
      Math.max(0, Date.parse(deviceState.nextScanAt) - Date.now()),
      2_147_483_647,
    );
    const timeout = window.setTimeout(() => void scanNow(), delay);
    return () => window.clearTimeout(timeout);
  }, [canScan, deviceState, loadedUserId, phase, scanNow, userId]);

  const setDailyScanEnabled = useCallback(
    (enabled: boolean) => {
      suppressImmediateScheduledScanRef.current = true;
      updateDeviceState((current) => ({
        ...current,
        dailyScanEnabled: enabled,
      }));
    },
    [updateDeviceState],
  );

  const setMatchMode = useCallback(
    (matchMode: DuplicateMatchMode) => {
      suppressImmediateScheduledScanRef.current = true;
      updateDeviceState((current) => ({
        ...current,
        matchMode,
      }));
    },
    [updateDeviceState],
  );

  const applyCleanup = useCallback(
    (keeperIds: string[], removedCount: number) => {
      const cleanedKeepers = new Set(keeperIds);
      setGroups((current) =>
        current?.filter((group) => !cleanedKeepers.has(group.keeper.id)) ?? null,
      );
      updateDeviceState((current) => ({
        ...current,
        duplicateCount: Math.max(0, current.duplicateCount - removedCount),
        duplicateGroups: current.duplicateGroups.filter(
          (group) => !cleanedKeepers.has(group.keeperId),
        ),
      }));
    },
    [updateDeviceState],
  );

  return (
    <DuplicateScanContext.Provider
      value={{
        applyCleanup,
        canScan,
        deviceState,
        error,
        groups,
        loadStoredGroups,
        phase,
        runId,
        scanNow,
        setDailyScanEnabled,
        setMatchMode,
      }}
    >
      {children}
    </DuplicateScanContext.Provider>
  );
}
