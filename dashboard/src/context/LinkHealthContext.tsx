import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getCachedBookmarksForUser } from "../lib/bookmarkCache";
import { normalizeBookmarkUrlForLinkCheck } from "../lib/bookmarkUrl";
import { checkLinkHealthBatch, type LinkHealthStatus } from "../lib/linkHealthApi";
import {
  isLinkHealthScanDue,
  nextLinkHealthScanAt,
  readLinkHealthState,
  writeLinkHealthState,
  type LinkHealthDeviceState,
} from "../lib/linkHealthPreference";
import {
  deleteLinkHealthResults,
  pruneLinkHealthResults,
  readLinkHealthResults,
  writeLinkHealthResults,
  type StoredLinkHealthResult,
} from "../lib/linkHealthStorage";
import type { Bookmark } from "../types/bookmark";
import {
  createLinkHealthBatches,
  groupBookmarksForLinkHealth,
} from "../lib/linkHealthQueue";
import { useAuth } from "./useAuth";
import { useEncryption } from "./useEncryption";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";

export type LinkHealthScanPhase = "idle" | "scanning" | "complete" | "error";

export interface LinkHealthBookmarkResult {
  bookmark: Bookmark;
  checkedAt: string;
  status: LinkHealthStatus;
  statusCode?: number;
}

interface LinkHealthContextValue {
  applyRemoval: (bookmarkIds: string[]) => Promise<void>;
  canScan: boolean;
  deviceState: LinkHealthDeviceState;
  error: string | null;
  loadStoredResults: () => Promise<void>;
  phase: LinkHealthScanPhase;
  pauseScan: () => void;
  results: LinkHealthBookmarkResult[] | null;
  runId: number;
  scanNow: () => Promise<void>;
  setAutomaticScanEnabled: (enabled: boolean) => void;
}

const EMPTY_STATE: LinkHealthDeviceState = {
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

// eslint-disable-next-line react-refresh/only-export-components
export const LinkHealthContext = createContext<LinkHealthContextValue | undefined>(
  undefined,
);

function visibleResults(
  bookmarks: Bookmark[],
  stored: Iterable<StoredLinkHealthResult>,
): LinkHealthBookmarkResult[] {
  const bookmarksById = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  return [...stored].flatMap((result) => {
    const bookmark = bookmarksById.get(result.bookmarkId);
    if (
      !bookmark ||
      normalizeBookmarkUrlForLinkCheck(bookmark.url) !== result.urlKey
    ) {
      return [];
    }
    return [{
      bookmark,
      checkedAt: result.checkedAt,
      status: result.status,
      ...(result.statusCode ? { statusCode: result.statusCode } : {}),
    }];
  });
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Scan cancelled", "AbortError"));
  }
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Scan cancelled", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function LinkHealthProvider({ children }: { children: ReactNode }) {
  const {
    bookmarkCacheSyncedAt,
    bookmarkCacheSyncing,
    isLocalAccount,
    libraryCacheHydrating,
    session,
    user,
  } = useAuth();
  const { cryptoKey } = useEncryption();
  const { data: accountPlan } = useAccountPlan();
  const hasPro = accountPlan?.id === "pro";
  const userId = user?.id ?? null;
  const accessToken = session?.access_token ?? "";
  const [deviceState, setDeviceState] = useState<LinkHealthDeviceState>(EMPTY_STATE);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [results, setResults] = useState<LinkHealthBookmarkResult[] | null>(null);
  const [phase, setPhase] = useState<LinkHealthScanPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const activeRunRef = useRef<AbortController | null>(null);
  const pauseRequestedRef = useRef(false);
  const suppressImmediateScheduledScanRef = useRef(false);
  const canScan = Boolean(
    userId &&
      hasPro &&
      loadedUserId === userId &&
      !isLocalAccount &&
      accessToken &&
      cryptoKey &&
      bookmarkCacheSyncedAt &&
      !bookmarkCacheSyncing &&
      !libraryCacheHydrating,
  );

  useEffect(() => {
    activeRunRef.current?.abort();
    activeRunRef.current = null;
    setResults(null);
    setPhase("idle");
    setError(null);
    if (!userId) {
      setDeviceState(EMPTY_STATE);
      setLoadedUserId(null);
      return;
    }
    setDeviceState(readLinkHealthState(userId));
    setLoadedUserId(userId);
  }, [userId]);

  useEffect(() => () => activeRunRef.current?.abort(), []);

  const updateDeviceState = useCallback(
    (update: (current: LinkHealthDeviceState) => LinkHealthDeviceState) => {
      setDeviceState((current) => {
        const next = update(current);
        if (userId) writeLinkHealthState(userId, next);
        return next;
      });
    },
    [userId],
  );

  const scanNow = useCallback(async () => {
    if (!canScan || !userId || !accessToken || activeRunRef.current) return;

    const controller = new AbortController();
    activeRunRef.current = controller;
    pauseRequestedRef.current = false;
    const startedAt = deviceState.scanStartedAt ?? new Date().toISOString();
    setRunId((current) => current + 1);
    setPhase("scanning");
    setError(null);

    try {
      const bookmarks = await getCachedBookmarksForUser(userId);
      const groups = groupBookmarksForLinkHealth(bookmarks);
      const eligibleBookmarks = [...groups.values()].flat();
      const storedResults = await readLinkHealthResults(userId);
      const storedByBookmarkId = new Map(
        storedResults.map((result) => [result.bookmarkId, result]),
      );
      const pendingGroups = [...groups.entries()].filter(([urlKey, matches]) =>
        matches.some((bookmark) => {
          const stored = storedByBookmarkId.get(bookmark.id);
          return !stored || stored.urlKey !== urlKey || stored.checkedAt < startedAt;
        }),
      );
      let scannedCount = eligibleBookmarks.length - pendingGroups.reduce(
        (count, [, matches]) => count + matches.length,
        0,
      );
      updateDeviceState((current) => ({
        ...current,
        scanInProgress: true,
        scanPaused: false,
        scanStartedAt: startedAt,
        scannedCount,
        totalCount: eligibleBookmarks.length,
      }));

      const batches = createLinkHealthBatches(pendingGroups);
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        if (controller.signal.aborted) {
          throw new DOMException("Scan cancelled", "AbortError");
        }
        const batch = batches[batchIndex];
        const checked = await checkLinkHealthBatch(
          accessToken,
          batch.map(([url]) => url),
          controller.signal,
        );
        const checkedAt = new Date().toISOString();
        const records = batch.flatMap(([urlKey, matches], index) =>
          matches.map((bookmark): StoredLinkHealthResult => ({
            bookmarkId: bookmark.id,
            checkedAt,
            status: checked[index].status,
            ...(checked[index].statusCode
              ? { statusCode: checked[index].statusCode }
              : {}),
            urlKey,
            userId,
          })),
        );
        await writeLinkHealthResults(records);
        for (const record of records) storedByBookmarkId.set(record.bookmarkId, record);
        scannedCount += records.length;
        updateDeviceState((current) => ({
          ...current,
          scanInProgress: true,
          scannedCount,
          totalCount: eligibleBookmarks.length,
        }));
        if (controller.signal.aborted) {
          throw new DOMException("Scan cancelled", "AbortError");
        }
        if (batchIndex + 1 < batches.length) {
          await abortableDelay(500, controller.signal);
        }
      }

      const bookmarkIds = new Set(eligibleBookmarks.map((bookmark) => bookmark.id));
      await pruneLinkHealthResults(userId, bookmarkIds);
      const nextResults = visibleResults(bookmarks, storedByBookmarkId.values());
      const completedAt = new Date().toISOString();
      setResults(nextResults);
      updateDeviceState((current) => ({
        ...current,
        brokenCount: nextResults.filter((result) => result.status === "broken").length,
        lastScanAt: completedAt,
        nextScanAt: nextLinkHealthScanAt(completedAt),
        scanInProgress: false,
        scanPaused: false,
        scanStartedAt: null,
        scannedCount: eligibleBookmarks.length,
        totalCount: eligibleBookmarks.length,
      }));
      setPhase("complete");
    } catch (scanError) {
      if (scanError instanceof DOMException && scanError.name === "AbortError") {
        if (pauseRequestedRef.current) {
          updateDeviceState((current) => ({
            ...current,
            scanInProgress: false,
            scanPaused: true,
          }));
          setPhase("idle");
          pauseRequestedRef.current = false;
        }
        return;
      }
      updateDeviceState((current) => ({ ...current, scanInProgress: false }));
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Could not check the library links.",
      );
      setPhase("error");
    } finally {
      if (activeRunRef.current === controller) activeRunRef.current = null;
    }
  }, [accessToken, canScan, deviceState.scanStartedAt, updateDeviceState, userId]);

  const pauseScan = useCallback(() => {
    if (!activeRunRef.current) return;
    pauseRequestedRef.current = true;
    activeRunRef.current.abort();
  }, []);

  const applyRemoval = useCallback(
    async (bookmarkIds: string[]) => {
      if (!userId || bookmarkIds.length === 0) return;
      const removedIds = new Set(bookmarkIds);
      setResults((current) =>
        current?.filter((result) => !removedIds.has(result.bookmark.id)) ?? null,
      );
      updateDeviceState((current) => ({
        ...current,
        brokenCount: Math.max(0, current.brokenCount - removedIds.size),
      }));
      await deleteLinkHealthResults(userId, bookmarkIds);
    },
    [updateDeviceState, userId],
  );

  const loadStoredResults = useCallback(async () => {
    if (results !== null || !canScan || !userId) return;
    const [bookmarks, stored] = await Promise.all([
      getCachedBookmarksForUser(userId),
      readLinkHealthResults(userId),
    ]);
    setResults(visibleResults(bookmarks, stored));
  }, [canScan, results, userId]);

  useEffect(() => {
    if (loadedUserId !== userId || phase !== "idle" || !canScan) return;
    const suppressImmediateScan = suppressImmediateScheduledScanRef.current;
    suppressImmediateScheduledScanRef.current = false;
    if (isLinkHealthScanDue(deviceState)) {
      if (!suppressImmediateScan) void scanNow();
      return;
    }
    if (!deviceState.automaticScanEnabled || !deviceState.nextScanAt) return;
    const delay = Math.min(
      Math.max(0, Date.parse(deviceState.nextScanAt) - Date.now()),
      2_147_483_647,
    );
    const timeout = window.setTimeout(() => void scanNow(), delay);
    return () => window.clearTimeout(timeout);
  }, [canScan, deviceState, loadedUserId, phase, scanNow, userId]);

  const setAutomaticScanEnabled = useCallback(
    (enabled: boolean) => {
      suppressImmediateScheduledScanRef.current = true;
      updateDeviceState((current) => ({
        ...current,
        automaticScanEnabled: enabled,
      }));
    },
    [updateDeviceState],
  );

  return (
    <LinkHealthContext.Provider
      value={{
        applyRemoval,
        canScan,
        deviceState,
        error,
        loadStoredResults,
        phase,
        pauseScan,
        results,
        runId,
        scanNow,
        setAutomaticScanEnabled,
      }}
    >
      {children}
    </LinkHealthContext.Provider>
  );
}
