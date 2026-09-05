import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getBookmarkExportGuideForUserAgent,
  getRemainingResourceLimit,
} from "@favlock/shared";
import { AlertTriangle, Check, Download, LoaderCircle, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import {
  RESOURCE_USAGE_QUERY_KEY,
  useResourceUsage,
} from "../hooks/useResourceUsageQuery";
import { WEB_DOCS_URL } from "../lib/appUrls";
import { withBrowserBookmarkImportLock } from "../lib/browserBookmarkImportLock";
import {
  folderPathKey,
  folderPathLabel,
  parseBrowserBookmarksFile,
  parseChromeBookmarksTree,
  type BrowserBookmarkImportResult,
} from "../lib/browserBookmarkImport";
import {
  prepareBrowserBookmarkImport,
  type BrowserBookmarkImportPreview,
  type InvalidBrowserBookmarkImportItem,
  type PreparedBrowserBookmarkImportItem,
} from "../lib/browserBookmarkImportPlan";
import {
  bookmarkMatchesImportedOverwrite,
  findReconciledCreatedBookmark,
  getAuthoritativeFolderIdByPath,
  loadAuthoritativeImportLibrary,
} from "../lib/browserBookmarkImportReconciliation";
import {
  clearImportRecoveryJournal,
  createImportRecoveryJournal,
  getImportItemState,
  readImportRecoveryJournal,
  saveImportRecoveryJournal,
  setImportItemState,
  summarizeImportRecovery,
  type ImportDuplicateResolution,
  type ImportRecoveryDecision,
  type ImportRecoveryInFlight,
  type ImportRecoveryJournal,
} from "../lib/importRecovery";
import { CloudAccessError } from "../lib/cloudAccess";
import { createFolder } from "../lib/taxonomyRepository";
import {
  createBookmark,
  moveBookmarkToFolder,
  overwriteBookmarkImportContent,
} from "../lib/bookmarkRepository";
import { setLibraryPopulated } from "../lib/onboarding";
import { favLockAuth } from "../lib/favLockAuth";
import { captureLocalVaultWork, trackLocalVaultWork } from "../lib/localVaultWork";
import { Button } from "./ui/button";
import { Checkbox, CheckboxField } from "./ui/checkbox";
import {
  DataTransferActionBar,
  DataTransferFileControl,
  DataTransferSectionHeader,
} from "./DataTransferControls";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Description, Field, Label } from "./ui/fieldset";

type ImportStatus = {
  type: "success" | "error" | "info";
  message: string;
};

type PreparedImport = {
  result: BrowserBookmarkImportResult;
  preview: BrowserBookmarkImportPreview;
  sourceKind: ImportRecoveryJournal["sourceKind"];
};

type DuplicateConflict = {
  item: PreparedBrowserBookmarkImportItem;
  existingBookmark: NonNullable<PreparedBrowserBookmarkImportItem["existingBookmark"]>;
};

type PendingDuplicateReview = {
  conflicts: DuplicateConflict[];
  currentIndex: number;
  journal: ImportRecoveryJournal;
};

const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const CHROME_BOOKMARK_REQUEST = "FAVLOCK_CHROME_BOOKMARKS_REQUEST";
const CHROME_BOOKMARK_RESULT = "FAVLOCK_CHROME_BOOKMARKS_RESULT";
const CHROME_EXTENSION_READY = "FAVLOCK_CHROME_EXTENSION_READY";
const CHROME_EXTENSION_PING = "FAVLOCK_CHROME_EXTENSION_PING";
const WRITE_BATCH_SIZE = 4;
const VISIBLE_IMPORT_ISSUE_LIMIT = 25;

function getChromeExtensionId(search: string): string | null {
  const extensionId = new URLSearchParams(search).get("chromeExtensionId");
  return extensionId && CHROME_EXTENSION_ID_PATTERN.test(extensionId)
    ? extensionId
    : null;
}

function shouldAutoImportChromeBookmarks(search: string): boolean {
  return new URLSearchParams(search).get("autoImport") === "chrome";
}

function decisionMap(journal: ImportRecoveryJournal) {
  return new Map(journal.decisions.map((decision) => [decision.index, decision]));
}

function resultMessage(journal: ImportRecoveryJournal): string {
  const summary = summarizeImportRecovery(journal);
  const parts = [
    `${summary.added} added`,
    `${summary.duplicate} duplicate${summary.duplicate === 1 ? "" : "s"}`,
    `${summary.failed} failed`,
    `${summary.remaining} remaining`,
  ];
  if (summary.overwritten) parts.splice(1, 0, `${summary.overwritten} overwritten`);
  if (summary.invalid) parts.splice(-2, 0, `${summary.invalid} invalid`);
  if (summary.unknown) parts.push(`${summary.unknown} outcome${summary.unknown === 1 ? "" : "s"} unknown`);
  return parts.join(", ");
}

type ImportIssueDetail = Pick<
  PreparedBrowserBookmarkImportItem | InvalidBrowserBookmarkImportItem,
  "index" | "title" | "url" | "folderPath"
> & { reason: string };

function ImportIssueDetails({
  title,
  items,
}: {
  title: string;
  items: ImportIssueDetail[];
}) {
  if (items.length === 0) return null;
  const visibleItems = items.slice(0, VISIBLE_IMPORT_ISSUE_LIMIT);
  return (
    <details className="mt-3 rounded-xl border border-gray-200 dark:border-[var(--app-line)]/20 bg-[var(--app-highlight)] px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-gray-900 dark:text-[var(--app-ink)]">
        {title} ({items.length})
      </summary>
      <ul className="mt-3 divide-y divide-gray-200 dark:divide-[var(--app-line)]/20">
        {visibleItems.map((item) => (
          <li key={item.index} className="min-w-0 py-3 first:pt-0 last:pb-0">
            <p className="truncate font-medium text-gray-900 dark:text-[var(--app-ink)]">{item.title}</p>
            <p className="mt-1 break-all text-xs text-gray-500 dark:text-[var(--app-muted)]">{item.url}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-[var(--app-muted)]">
              Collection: {item.folderPath.length ? folderPathLabel(item.folderPath) : "None"}
            </p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">{item.reason}</p>
          </li>
        ))}
      </ul>
      {items.length > visibleItems.length ? (
        <p className="mt-3 border-t border-gray-200 dark:border-[var(--app-line)]/20 pt-3 text-xs text-gray-500 dark:text-[var(--app-muted)]">
          Showing the first {visibleItems.length} of {items.length} records.
        </p>
      ) : null}
    </details>
  );
}

function isQuotaError(error: unknown): error is CloudAccessError {
  return error instanceof CloudAccessError && error.code === "quota_exceeded";
}

export default function BrowserBookmarkImportSection() {
  const { user, session, retryBookmarkCacheSync } = useAuth();
  const userId = user?.id ?? null;
  const accessToken = session?.access_token ?? "";
  const { cryptoKey, decryptField, encryptField, keyLoading } = useEncryption();
  const { refetch: refetchAccountPlan } = useAccountPlan();
  const { refetch: refetchResourceUsage } = useResourceUsage();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chromeBridgeRef = useRef<HTMLIFrameElement>(null);
  const pendingChromeRequestRef = useRef<string | null>(null);
  const chromeRequestTimeoutRef = useRef<number | null>(null);
  const autoChromeImportStartedRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const mountedRef = useRef(true);
  const journalRef = useRef<ImportRecoveryJournal | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [isChromeExtensionReady, setIsChromeExtensionReady] = useState(false);
  const [preparedImport, setPreparedImport] = useState<PreparedImport | null>(null);
  const [recoveryJournal, setRecoveryJournal] =
    useState<ImportRecoveryJournal | null>(null);
  const [pendingDuplicateReview, setPendingDuplicateReview] =
    useState<PendingDuplicateReview | null>(null);
  const [applyDuplicateChoiceToAll, setApplyDuplicateChoiceToAll] =
    useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const chromeExtensionId = useMemo(
    () => getChromeExtensionId(location.search),
    [location.search],
  );
  const autoImportChromeBookmarks = useMemo(
    () => shouldAutoImportChromeBookmarks(location.search),
    [location.search],
  );
  const bookmarkExportGuide = useMemo(
    () => getBookmarkExportGuideForUserAgent(navigator.userAgent),
    [],
  );
  const chromeExtensionOrigin = chromeExtensionId
    ? `chrome-extension://${chromeExtensionId}`
    : null;

  const persistJournal = useCallback(
    async (journal: ImportRecoveryJournal) => {
      if (!userId || !cryptoKey || userId !== journal.userId) {
        throw new Error("The account changed. Select the original file after signing in again.");
      }
      const assertVaultCurrent = captureLocalVaultWork(journal.userId);
      const assertCurrent = () => {
        assertVaultCurrent();
        if (favLockAuth.getLocalUser()?.id !== journal.userId) {
          throw new Error("The account changed. Select the original file after signing in again.");
        }
      };
      await saveImportRecoveryJournal(journal, cryptoKey, assertCurrent);
      journalRef.current = journal;
      if (mountedRef.current) setRecoveryJournal(journal);
    },
    [cryptoKey, userId],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelRequestedRef.current = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!userId || !cryptoKey) {
      journalRef.current = null;
      setRecoveryJournal(null);
      return;
    }
    void readImportRecoveryJournal(userId, cryptoKey).then((journal) => {
      if (cancelled) return;
      journalRef.current = journal;
      setRecoveryJournal(journal);
      if (journal) {
        setStatus({
          type: "info",
          message: `An interrupted import is available: ${resultMessage(journal)}. Reselect the original source to reconcile and continue.`,
        });
      }
    });
    return () => { cancelled = true; };
  }, [cryptoKey, userId]);

  const resetInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const loadLimits = useCallback(async () => {
    const [planResult, usageResult] = await Promise.all([
      refetchAccountPlan(),
      refetchResourceUsage(),
    ]);
    if (!planResult.data) {
      throw new Error("Could not load your account limits. Try again.");
    }
    if (!usageResult.data) {
      throw new Error("Could not load your account usage. Try again.");
    }
    return { plan: planResult.data, usage: usageResult.data };
  }, [refetchAccountPlan, refetchResourceUsage]);

  const prepareImport = useCallback(
    async (
      loadImport: () => Promise<BrowserBookmarkImportResult>,
      initialProgress: string,
      sourceKind: PreparedImport["sourceKind"],
    ) => {
      if (!user || !accessToken || !cryptoKey) {
        setStatus({ type: "error", message: "Unlock your signed-in library before importing." });
        return;
      }
      setIsBusy(true);
      setProgress(initialProgress);
      setStatus(null);
      setPreparedImport(null);
      try {
        const result = await loadImport();
        if (result.bookmarks.length === 0) {
          throw new Error("No bookmarks were found to import.");
        }
        setProgress("Checking duplicates and current allowances...");
        const [library, limits] = await Promise.all([
          loadAuthoritativeImportLibrary(accessToken, user.id, decryptField),
          loadLimits(),
        ]);
        const preview = await prepareBrowserBookmarkImport(
          result,
          library.bookmarks,
          library.folders,
          limits.plan,
          limits.usage,
        );
        const existingRecovery = journalRef.current;
        if (
          existingRecovery &&
          existingRecovery.sourceFingerprint !== preview.fingerprint
        ) {
          throw new Error(
            "This source does not match the interrupted import. Reselect the original file, or discard the saved recovery first.",
          );
        }
        setPreparedImport({ result, preview, sourceKind });
        setStatus({
          type: preview.blockedReason ? "error" : "info",
          message: preview.blockedReason ?? (existingRecovery
            ? "Source verified. Resume will reconcile uncertain writes before continuing."
            : "Preview ready. Nothing has been written yet."),
        });
      } catch (error) {
        setStatus({
          type: "error",
          message: error instanceof Error ? error.message : "Could not prepare this import.",
        });
      } finally {
        setProgress(null);
        setIsBusy(false);
      }
    },
    [accessToken, cryptoKey, decryptField, loadLimits, user],
  );

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    const isZip = file.name.toLowerCase().endsWith(".zip");
    await prepareImport(
      () => parseBrowserBookmarksFile(file),
      isZip ? "Reading Safari bookmark archive..." : "Reading bookmark export...",
      isZip ? "safari-zip" : "html",
    );
    resetInput();
  };

  const finalizeQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["folders"] }),
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
      queryClient.invalidateQueries({ queryKey: RESOURCE_USAGE_QUERY_KEY }),
    ]);
    retryBookmarkCacheSync();
  }, [queryClient, retryBookmarkCacheSync]);

  const finishRun = useCallback(
    async (journal: ImportRecoveryJournal, cancelled = false) => {
      const summary = summarizeImportRecovery(journal);
      await finalizeQueries();
      if (summary.added > 0 || summary.overwritten > 0) {
        setLibraryPopulated(journal.userId, true);
      }
      const complete = summary.remaining === 0 && summary.unknown === 0;
      const successful = complete && summary.failed === 0;
      if (successful) {
        clearImportRecoveryJournal(journal.userId);
        journalRef.current = null;
        setRecoveryJournal(null);
      }
      setStatus({
        type: successful ? "success" : "info",
        message: `${cancelled ? "Import canceled" : complete ? "Import finished" : "Import paused"}: ${resultMessage(journal)}.`,
      });
    },
    [finalizeQueries],
  );

  const executeImport = useCallback(
    async (initialJournal: ImportRecoveryJournal) => {
      const prepared = preparedImport;
      if (!prepared || !user || !accessToken || !cryptoKey) return;
      cancelRequestedRef.current = false;
      setIsBusy(true);
      setIsWriting(true);
      setStatus(null);
      let journal = initialJournal;
      const itemByIndex = new Map(prepared.preview.items.map((item) => [item.index, item]));

      try {
        await trackLocalVaultWork(user.id, withBrowserBookmarkImportLock(user.id, async () => {
          let library = await loadAuthoritativeImportLibrary(
            accessToken,
            user.id,
            decryptField,
          );

          if (journal.inFlight.length > 0) {
            setProgress("Reconciling interrupted writes before retrying...");
            const unresolved: ImportRecoveryInFlight[] = [];
            for (const operation of journal.inFlight) {
              const item = itemByIndex.get(operation.index);
              if (operation.kind === "create-folder") {
                const folderId = operation.folderKey
                  ? getAuthoritativeFolderIdByPath(library.folders).get(operation.folderKey)
                  : null;
                if (folderId && operation.folderKey) {
                  journal.folderIds = [
                    ...journal.folderIds.filter(([key]) => key !== operation.folderKey),
                    [operation.folderKey, folderId],
                  ];
                }
                continue;
              }
              if (!item) continue;
              if (operation.kind === "create") {
                const reconciled = findReconciledCreatedBookmark(
                  item,
                  operation.existingIds ?? [],
                  library,
                );
                if (reconciled === "ambiguous") {
                  journal = setImportItemState(journal, operation.index, "unknown");
                  unresolved.push(operation);
                } else if (reconciled) {
                  journal = setImportItemState(journal, operation.index, "added");
                } else {
                  journal = setImportItemState(journal, operation.index, "pending");
                }
                continue;
              }
              const bookmarkId = operation.bookmarkId;
              if (!bookmarkId) continue;
              const matches = bookmarkMatchesImportedOverwrite(
                bookmarkId,
                item,
                library,
              );
              if (matches.content && matches.folder) {
                journal = setImportItemState(journal, operation.index, "overwritten");
              } else {
                journal = setImportItemState(journal, operation.index, "pending");
              }
            }
            journal = { ...journal, inFlight: unresolved };
            await persistJournal(journal);
            if (unresolved.length > 0) {
              await finishRun(journal);
              return;
            }
          }

          const limits = await loadLimits();
          const decisions = decisionMap(journal);
          for (const item of prepared.preview.items) {
            if (
              getImportItemState(journal, item.index) === "pending" &&
              item.duplicate === null &&
              library.bookmarks.some((bookmark) => {
                try { return new URL(bookmark.url).toString() === item.url; }
                catch { return false; }
              })
            ) {
              journal = setImportItemState(journal, item.index, "duplicate");
            }
          }
          await persistJournal(journal);
          const requiredAdds = prepared.preview.items.filter((item) => {
            if (getImportItemState(journal, item.index) !== "pending") return false;
            if (item.duplicate === null) return true;
            return item.duplicate === "library" && decisions.get(item.index)?.resolution === "keep";
          }).length;
          const available = getRemainingResourceLimit(
            limits.usage.bookmarks,
            limits.plan.limits.bookmarks,
          );
          if (available !== null && requiredAdds > available) {
            throw new Error(
              `This import now needs space for ${requiredAdds} bookmarks, but your current plan has ${available} remaining. No bookmarks were truncated.`,
            );
          }

          const folderIdByPath = getAuthoritativeFolderIdByPath(library.folders);
          for (const [key, id] of journal.folderIds) folderIdByPath.set(key, id);
          const nextSortOrderByParentId = new Map<string | null, number>();
          for (const folder of library.folders) {
            const next = nextSortOrderByParentId.get(folder.parent_id) ?? 0;
            nextSortOrderByParentId.set(
              folder.parent_id,
              Math.max(next, (folder.sort_order ?? 0) + 1),
            );
          }

          for (let folderIndex = 0; folderIndex < prepared.preview.folderPaths.length; folderIndex += 1) {
            if (cancelRequestedRef.current) break;
            const folderPath = prepared.preview.folderPaths[folderIndex];
            const key = folderPathKey(folderPath);
            if (folderIdByPath.has(key)) continue;
            const parentPath = folderPath.slice(0, -1);
            const parentId = parentPath.length
              ? folderIdByPath.get(folderPathKey(parentPath))
              : null;
            if (parentPath.length && !parentId) {
              throw new Error(`Could not reconcile parent collection "${folderPathLabel(parentPath)}".`);
            }
            setProgress(`Creating collection ${folderIndex + 1} of ${prepared.preview.folderPaths.length}...`);
            const operation: ImportRecoveryInFlight = {
              kind: "create-folder",
              index: 0,
              folderKey: key,
            };
            journal = { ...journal, inFlight: [operation] };
            await persistJournal(journal);
            try {
              const sortOrder = nextSortOrderByParentId.get(parentId ?? null) ?? 0;
              const created = await createFolder(accessToken, {
                encryptedName: await encryptField(folderPath.at(-1) ?? ""),
                color: null,
                parentId: parentId ?? null,
                sortOrder,
              });
              folderIdByPath.set(key, created.folderId);
              nextSortOrderByParentId.set(parentId ?? null, sortOrder + 1);
              journal = {
                ...journal,
                folderIds: [...journal.folderIds.filter(([pathKey]) => pathKey !== key), [key, created.folderId]],
                inFlight: [],
              };
              await persistJournal(journal);
            } catch (error) {
              library = await loadAuthoritativeImportLibrary(accessToken, user.id, decryptField);
              const reconciledId = getAuthoritativeFolderIdByPath(library.folders).get(key);
              if (!reconciledId) throw error;
              folderIdByPath.set(key, reconciledId);
              journal = {
                ...journal,
                folderIds: [...journal.folderIds.filter(([pathKey]) => pathKey !== key), [key, reconciledId]],
                inFlight: [],
              };
              await persistJournal(journal);
            }
          }

          const pendingItems = prepared.preview.items.filter(
            (item) => getImportItemState(journal, item.index) === "pending",
          );
          for (let offset = 0; offset < pendingItems.length; offset += WRITE_BATCH_SIZE) {
            if (cancelRequestedRef.current) break;
            const batch = pendingItems.slice(offset, offset + WRITE_BATCH_SIZE);
            setProgress(
              `Importing ${Math.min(offset + batch.length, pendingItems.length)} of ${pendingItems.length} remaining bookmarks...`,
            );
            const currentIdsByUrl = new Map<string, string[]>();
            for (const bookmark of library.bookmarks) {
              let normalized: string;
              try { normalized = new URL(bookmark.url).toString(); } catch { continue; }
              const ids = currentIdsByUrl.get(normalized) ?? [];
              ids.push(bookmark.id);
              currentIdsByUrl.set(normalized, ids);
            }
            const operations: ImportRecoveryInFlight[] = batch.map((item) => {
              const decision = decisions.get(item.index);
              return decision?.resolution === "overwrite"
                ? {
                    kind: "overwrite-content",
                    index: item.index,
                    bookmarkId: decision.existingBookmarkId,
                  }
                : {
                    kind: "create",
                    index: item.index,
                    existingIds: currentIdsByUrl.get(item.url) ?? [],
                  };
            });
            journal = { ...journal, inFlight: operations };
            await persistJournal(journal);

            const settled = await Promise.allSettled(
              batch.map(async (item) => {
                const decision = decisions.get(item.index);
                const folderId = item.folderPath.length
                  ? folderIdByPath.get(folderPathKey(item.folderPath)) ?? null
                  : null;
                if (decision?.resolution === "skip" || item.duplicate === "source") {
                  return { state: "duplicate" as const };
                }
                if (decision?.resolution === "overwrite") {
                  const matches = bookmarkMatchesImportedOverwrite(
                    decision.existingBookmarkId,
                    item,
                    library,
                  );
                  if (!matches.content) {
                    await overwriteBookmarkImportContent(
                      accessToken,
                      decision.existingBookmarkId,
                      await encryptField(item.title),
                      await encryptField(item.url),
                    );
                  }
                  if (!matches.folder) {
                    await moveBookmarkToFolder(
                      accessToken,
                      decision.existingBookmarkId,
                      folderId,
                    );
                  }
                  return { state: "overwritten" as const };
                }
                await createBookmark(accessToken, {
                  title: await encryptField(item.title),
                  url: await encryptField(item.url),
                  folderId,
                  existingTagIds: [],
                  newEncryptedTagNames: [],
                });
                return { state: "added" as const };
              }),
            );

            const failures = settled
              .map((result, index) => ({ result, index }))
              .filter(({ result }) => result.status === "rejected");
            settled.forEach((result, index) => {
              if (result.status === "fulfilled") {
                journal = setImportItemState(journal, batch[index].index, result.value.state);
              }
            });
            const quotaRejected = failures.some(
              ({ result }) => result.status === "rejected" && isQuotaError(result.reason),
            );
            if (failures.length > 0) {
              try {
                library = await loadAuthoritativeImportLibrary(accessToken, user.id, decryptField);
              } catch {
                for (const { index } of failures) {
                  journal = setImportItemState(journal, batch[index].index, "unknown");
                }
                journal = {
                  ...journal,
                  inFlight: failures.map(({ index }) => operations[index]),
                };
                await persistJournal(journal);
                await finishRun(journal);
                return;
              }
              const unresolved: ImportRecoveryInFlight[] = [];
              for (const { index } of failures) {
                const item = batch[index];
                const operation = operations[index];
                if (operation.kind === "create") {
                  const reconciled = findReconciledCreatedBookmark(
                    item,
                    operation.existingIds ?? [],
                    library,
                  );
                  if (reconciled === "ambiguous") {
                    journal = setImportItemState(journal, item.index, "unknown");
                    unresolved.push(operation);
                  } else {
                    journal = setImportItemState(journal, item.index, reconciled ? "added" : "failed");
                  }
                } else {
                  const bookmarkId = operation.bookmarkId ?? "";
                  const matches = bookmarkMatchesImportedOverwrite(bookmarkId, item, library);
                  journal = setImportItemState(
                    journal,
                    item.index,
                    matches.content && matches.folder ? "overwritten" : "failed",
                  );
                }
              }
              journal = { ...journal, inFlight: unresolved };
            } else {
              journal = { ...journal, inFlight: [] };
            }
            await persistJournal(journal);
            if (journal.inFlight.length > 0 || quotaRejected) break;
          }

          await finishRun(journal, cancelRequestedRef.current);
        }));
      } catch (error) {
        const current = journalRef.current ?? journal;
        setStatus({
          type: "error",
          message: `${error instanceof Error ? error.message : "Could not continue the import."} Current result: ${resultMessage(current)}.`,
        });
      } finally {
        setProgress(null);
        setIsBusy(false);
        setIsWriting(false);
      }
    },
    [
      accessToken,
      cryptoKey,
      decryptField,
      encryptField,
      finishRun,
      loadLimits,
      persistJournal,
      preparedImport,
      user,
    ],
  );

  const continueAfterDuplicateReview = useCallback(
    async (journal: ImportRecoveryJournal) => {
      setPendingDuplicateReview(null);
      setApplyDuplicateChoiceToAll(false);
      await persistJournal(journal);
      void executeImport(journal);
    },
    [executeImport, persistJournal],
  );

  const startOrResumeImport = useCallback(async () => {
    if (!preparedImport || !user || !cryptoKey) return;
    if (preparedImport.preview.blockedReason) {
      setStatus({ type: "error", message: preparedImport.preview.blockedReason });
      return;
    }
    let journal = journalRef.current;
    if (!journal) {
      journal = createImportRecoveryJournal(
        user.id,
        preparedImport.preview.fingerprint,
        preparedImport.sourceKind,
        preparedImport.preview.totalCount,
      );
      const validIndices = new Set(preparedImport.preview.items.map(({ index }) => index));
      for (let index = 0; index < journal.itemCount; index += 1) {
        if (!validIndices.has(index)) journal = setImportItemState(journal, index, "invalid");
      }
      for (const item of preparedImport.preview.items) {
        if (item.duplicate === "source") {
          journal = setImportItemState(journal, item.index, "duplicate");
        }
      }
      await persistJournal(journal);
    }

    if (journal.inFlight.length > 0) {
      void executeImport(journal);
      return;
    }

    const decisions = decisionMap(journal);
    const conflicts = preparedImport.preview.items
      .filter(
        (item): item is PreparedBrowserBookmarkImportItem & {
          existingBookmark: NonNullable<PreparedBrowserBookmarkImportItem["existingBookmark"]>;
        } =>
          item.duplicate === "library" &&
          Boolean(item.existingBookmark) &&
          getImportItemState(journal!, item.index) === "pending" &&
          !decisions.has(item.index),
      )
      .map((item) => ({ item, existingBookmark: item.existingBookmark }));
    if (conflicts.length > 0) {
      setPendingDuplicateReview({ conflicts, currentIndex: 0, journal });
      return;
    }
    void executeImport(journal);
  }, [cryptoKey, executeImport, persistJournal, preparedImport, user]);

  const handleDuplicateResolution = async (resolution: ImportDuplicateResolution) => {
    if (!pendingDuplicateReview) return;
    const current = pendingDuplicateReview.conflicts[pendingDuplicateReview.currentIndex];
    let journal = {
      ...pendingDuplicateReview.journal,
      decisions: [
        ...pendingDuplicateReview.journal.decisions.filter(({ index }) => index !== current.item.index),
        {
          index: current.item.index,
          resolution,
          existingBookmarkId: current.existingBookmark.id,
        } satisfies ImportRecoveryDecision,
      ],
    };
    if (resolution === "skip") {
      journal = setImportItemState(journal, current.item.index, "duplicate");
    }
    if (applyDuplicateChoiceToAll) {
      for (const conflict of pendingDuplicateReview.conflicts.slice(pendingDuplicateReview.currentIndex + 1)) {
        journal = {
          ...journal,
          decisions: [
            ...journal.decisions.filter(({ index }) => index !== conflict.item.index),
            {
              index: conflict.item.index,
              resolution,
              existingBookmarkId: conflict.existingBookmark.id,
            },
          ],
        };
        if (resolution === "skip") {
          journal = setImportItemState(journal, conflict.item.index, "duplicate");
        }
      }
      await continueAfterDuplicateReview(journal);
      return;
    }
    const nextIndex = pendingDuplicateReview.currentIndex + 1;
    if (nextIndex < pendingDuplicateReview.conflicts.length) {
      setPendingDuplicateReview({ ...pendingDuplicateReview, currentIndex: nextIndex, journal });
      await persistJournal(journal);
      return;
    }
    await continueAfterDuplicateReview(journal);
  };

  const cancelDuplicateReview = () => {
    setPendingDuplicateReview(null);
    setApplyDuplicateChoiceToAll(false);
    setStatus({ type: "info", message: "Import canceled before any bookmark writes. Your preview is still available." });
  };

  const discardRecovery = () => {
    if (!user) return;
    clearImportRecoveryJournal(user.id);
    journalRef.current = null;
    setRecoveryJournal(null);
    setPreparedImport(null);
    setSelectedFileName(null);
    setStatus({ type: "info", message: "Saved import recovery discarded. Your existing library was not changed." });
  };

  const retryFailed = async () => {
    const journal = journalRef.current;
    if (!journal) return;
    let next = journal;
    const retryableIndices = new Set(
      preparedImport?.preview.items.map(({ index }) => index) ?? [],
    );
    for (let index = 0; index < journal.itemCount; index += 1) {
      if (getImportItemState(next, index) === "failed") {
        if (retryableIndices.has(index)) {
          next = setImportItemState(next, index, "pending");
        }
      }
    }
    await persistJournal(next);
    void executeImport(next);
  };

  useEffect(() => {
    if (!chromeExtensionOrigin) return;
    const handleChromeMessage = (event: MessageEvent) => {
      if (
        event.origin !== chromeExtensionOrigin ||
        event.source !== chromeBridgeRef.current?.contentWindow
      ) return;
      if (event.data?.type === CHROME_EXTENSION_READY) {
        setIsChromeExtensionReady(true);
        return;
      }
      if (
        event.data?.type !== CHROME_BOOKMARK_RESULT ||
        event.data?.requestId !== pendingChromeRequestRef.current
      ) return;
      pendingChromeRequestRef.current = null;
      if (chromeRequestTimeoutRef.current !== null) {
        window.clearTimeout(chromeRequestTimeoutRef.current);
        chromeRequestTimeoutRef.current = null;
      }
      if (typeof event.data.error === "string") {
        setProgress(null);
        setIsBusy(false);
        setStatus({ type: "error", message: event.data.error });
        return;
      }
      void prepareImport(
        async () => parseChromeBookmarksTree(event.data.tree),
        "Reading Chrome bookmarks...",
        "chrome",
      );
    };
    window.addEventListener("message", handleChromeMessage);
    return () => window.removeEventListener("message", handleChromeMessage);
  }, [chromeExtensionOrigin, prepareImport]);

  useEffect(() => () => {
    if (chromeRequestTimeoutRef.current !== null) {
      window.clearTimeout(chromeRequestTimeoutRef.current);
    }
  }, []);

  const handleChromeImport = useCallback(() => {
    if (!chromeExtensionOrigin || !chromeBridgeRef.current?.contentWindow) {
      setStatus({ type: "error", message: "Open this import screen from the FavLock Chrome extension." });
      return;
    }
    if (!isChromeExtensionReady) {
      setStatus({ type: "error", message: "Could not connect to the Chrome extension. Reload it and open this screen again." });
      return;
    }
    const requestId = crypto.randomUUID();
    pendingChromeRequestRef.current = requestId;
    setSelectedFileName(null);
    setIsBusy(true);
    setProgress("Reading Chrome bookmarks...");
    setStatus(null);
    chromeBridgeRef.current.contentWindow.postMessage(
      { type: CHROME_BOOKMARK_REQUEST, requestId },
      chromeExtensionOrigin,
    );
    chromeRequestTimeoutRef.current = window.setTimeout(() => {
      if (pendingChromeRequestRef.current !== requestId) return;
      pendingChromeRequestRef.current = null;
      chromeRequestTimeoutRef.current = null;
      setProgress(null);
      setIsBusy(false);
      setStatus({ type: "error", message: "Chrome did not respond. Reload the extension and try again." });
    }, 10_000);
  }, [chromeExtensionOrigin, isChromeExtensionReady]);

  const handleChromeBridgeLoad = () => {
    if (!chromeExtensionOrigin || !chromeBridgeRef.current?.contentWindow) return;
    chromeBridgeRef.current.contentWindow.postMessage(
      { type: CHROME_EXTENSION_PING },
      chromeExtensionOrigin,
    );
  };

  useEffect(() => {
    if (
      !autoImportChromeBookmarks ||
      autoChromeImportStartedRef.current ||
      !user ||
      !cryptoKey ||
      keyLoading ||
      !isChromeExtensionReady
    ) return;
    autoChromeImportStartedRef.current = true;
    const nextSearchParams = new URLSearchParams(location.search);
    nextSearchParams.delete("autoImport");
    const nextSearch = nextSearchParams.toString();
    navigate(
      { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : "", hash: location.hash },
      { replace: true },
    );
    handleChromeImport();
  }, [
    autoImportChromeBookmarks,
    cryptoKey,
    handleChromeImport,
    isChromeExtensionReady,
    keyLoading,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    user,
  ]);

  const activeDuplicateConflict = pendingDuplicateReview
    ? pendingDuplicateReview.conflicts[pendingDuplicateReview.currentIndex]
    : null;
  const recoverySummary = recoveryJournal
    ? summarizeImportRecovery(recoveryJournal)
    : null;
  const failedItems: ImportIssueDetail[] = preparedImport && recoveryJournal
    ? preparedImport.preview.items
        .filter((item) => getImportItemState(recoveryJournal, item.index) === "failed")
        .map((item) => ({
          ...item,
          reason: "FavLock could not confirm this bookmark was saved. It is safe to retry.",
        }))
    : [];
  const unknownIndices = new Set<number>();
  if (recoveryJournal) {
    for (const item of preparedImport?.preview.items ?? []) {
      if (getImportItemState(recoveryJournal, item.index) === "unknown") {
        unknownIndices.add(item.index);
      }
    }
    for (const operation of recoveryJournal.inFlight) {
      if (operation.kind !== "create-folder") unknownIndices.add(operation.index);
    }
  }
  const unknownItems: ImportIssueDetail[] = preparedImport
    ? preparedImport.preview.items
        .filter(({ index }) => unknownIndices.has(index))
        .map((item) => ({
          ...item,
          reason: "The write may have completed. FavLock will reconcile it before retrying.",
        }))
    : [];

  return (
    <>
      <Dialog open={Boolean(activeDuplicateConflict)} onClose={cancelDuplicateReview} size="lg">
        <DialogTitle>Duplicate bookmark found</DialogTitle>
        <DialogDescription>
          This URL is already in your FavLock library. Choose what to do before writes begin.
        </DialogDescription>
        {activeDuplicateConflict && pendingDuplicateReview ? (
          <div className="mt-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-[var(--app-muted)]">
              Duplicate {pendingDuplicateReview.currentIndex + 1} of {pendingDuplicateReview.conflicts.length}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-gray-200 dark:border-[var(--app-line)]/20 bg-gray-50 dark:bg-[var(--app-card)] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-[var(--app-muted)]">Existing bookmark</p>
                <p className="mt-2 truncate text-sm font-semibold text-gray-900 dark:text-[var(--app-ink)]">{activeDuplicateConflict.existingBookmark.title}</p>
                <p className="mt-1 break-all text-xs text-gray-500 dark:text-[var(--app-muted)]">{activeDuplicateConflict.existingBookmark.url}</p>
              </div>
              <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50/60 dark:bg-[var(--app-mint)] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Imported bookmark</p>
                <p className="mt-2 truncate text-sm font-semibold text-gray-900 dark:text-[var(--app-ink)]">{activeDuplicateConflict.item.title}</p>
                <p className="mt-1 break-all text-xs text-gray-500 dark:text-[var(--app-muted)]">{activeDuplicateConflict.item.url}</p>
              </div>
            </div>
            <p className="text-sm leading-6 text-gray-600 dark:text-[var(--app-muted)]">
              Overwrite replaces the existing title, URL, and collection while preserving its tags and favorite status.
            </p>
            <CheckboxField>
              <Checkbox color="emerald" checked={applyDuplicateChoiceToAll} onChange={setApplyDuplicateChoiceToAll} />
              <Label>Apply this choice to all remaining duplicates</Label>
            </CheckboxField>
          </div>
        ) : null}
        <DialogActions className="sm:flex-wrap">
          <Button type="button" plain onClick={cancelDuplicateReview}>Cancel import</Button>
          <Button type="button" outline onClick={() => { void handleDuplicateResolution("skip"); }}>Skip</Button>
          <Button type="button" color="emerald" onClick={() => { void handleDuplicateResolution("keep"); }}>Keep both</Button>
          <Button type="button" color="amber" onClick={() => { void handleDuplicateResolution("overwrite"); }}>Overwrite</Button>
        </DialogActions>
      </Dialog>

      <section aria-labelledby="bookmark-import-heading">
        <DataTransferSectionHeader
          id="bookmark-import-heading"
          title="Import bookmarks"
          description={
            <>
              {chromeExtensionId
                ? "Import directly from Chrome, or choose an HTML or Safari ZIP export."
                : "Import HTML exports from Chrome, Edge, or Firefox, and ZIP exports from Safari."}{" "}
              Folder nesting is preserved as collections and subcollections.
            </>
          }
        />

        {chromeExtensionOrigin ? (
          <iframe ref={chromeBridgeRef} src={`${chromeExtensionOrigin}/bookmark-import-bridge.html`} title="FavLock Chrome bookmark importer" className="hidden" tabIndex={-1} onLoad={handleChromeBridgeLoad} />
        ) : null}

        <Field className="mt-6">
          <Label htmlFor="browser-bookmark-import-file">Bookmark export</Label>
          <Description id="browser-bookmark-import-file-description">
            Choose an HTML export or Safari ZIP file. FavLock previews it before writing.
          </Description>
          <DataTransferFileControl
            id="browser-bookmark-import-file"
            descriptionId="browser-bookmark-import-file-description"
            inputRef={fileInputRef}
            accept=".html,.htm,.zip,text/html,application/zip,application/x-zip-compressed"
            fileName={selectedFileName}
            emptyLabel={recoveryJournal ? "Reselect the original source to resume" : "No bookmark file selected"}
            disabled={isBusy || keyLoading}
            busy={isBusy}
            busyLabel={isWriting ? "Importing..." : "Preparing..."}
            onChange={(event) => { void handleImportFile(event); }}
          />
        </Field>

        {chromeExtensionId ? (
          <DataTransferActionBar className="mt-4">
            <Button type="button" color="emerald" disabled={isBusy || !cryptoKey || keyLoading} onClick={handleChromeImport}>
              {isBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
              {isBusy ? "Preparing..." : recoveryJournal?.sourceKind === "chrome" ? "Reselect from Chrome" : "Import from Chrome"}
            </Button>
          </DataTransferActionBar>
        ) : null}

        {preparedImport ? (
          <div className="mt-5 rounded-2xl border border-gray-200 dark:border-[var(--app-line)]/20 bg-gray-50/70 dark:bg-[var(--app-card)]/70 p-4" aria-label="Import preview">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-[var(--app-ink)]">Import preview</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-[var(--app-muted)]">Nothing is written until you continue.</p>
              </div>
              <span className="rounded-full bg-[var(--app-highlight)] px-3 py-1 text-xs font-medium text-gray-600 dark:text-[var(--app-muted)] ring-1 ring-gray-200 dark:ring-[var(--app-line)]">
                {preparedImport.preview.availableBookmarks === null
                  ? "Unlimited bookmark capacity"
                  : `${preparedImport.preview.availableBookmarks.toLocaleString("en-US")} bookmark spaces available`}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Valid records", preparedImport.preview.validCount],
                ["Duplicates", preparedImport.preview.duplicateCount],
                ["Invalid / unsupported", preparedImport.preview.invalidCount],
                ["New collections", preparedImport.preview.newFolderPaths.length],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-[var(--app-highlight)] p-3 ring-1 ring-gray-200/80 dark:ring-[var(--app-line)]/80">
                  <dt className="text-xs text-gray-500 dark:text-[var(--app-muted)]">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-[var(--app-ink)]">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-[var(--app-muted)]">
              {preparedImport.preview.readyToAddCount} records can be added immediately. {preparedImport.preview.libraryDuplicateCount} library duplicates require a choice; {preparedImport.preview.sourceDuplicateCount} repeated source records will be skipped. {preparedImport.preview.bookmarkLimit === 0 ? "Your plan has no bookmark-count limit." : `Your ${preparedImport.preview.bookmarkLimit.toLocaleString("en-US")}-bookmark plan limit is unchanged.`}
            </p>
            <ImportIssueDetails
              title="Invalid / unsupported records"
              items={preparedImport.preview.invalidItems}
            />
            {preparedImport.preview.blockedReason ? (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300" role="alert">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {preparedImport.preview.blockedReason} Remove records from the export or free supported space, then select the source again.
              </p>
            ) : (
              <DataTransferActionBar className="mt-4">
                <Button type="button" color="emerald" disabled={isBusy} onClick={() => { void startOrResumeImport(); }}>
                  {recoveryJournal ? "Reconcile and resume" : preparedImport.preview.libraryDuplicateCount ? "Review duplicates and import" : "Start import"}
                </Button>
              </DataTransferActionBar>
            )}
          </div>
        ) : null}

        {recoverySummary && !preparedImport ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 dark:bg-[var(--app-butter)] p-4">
            <h3 className="text-sm font-semibold text-amber-950 dark:text-amber-200">Interrupted import</h3>
            <p className="mt-1 text-sm leading-6 text-amber-900 dark:text-amber-200">
              {resultMessage(recoveryJournal!)}. Reselect the original {recoveryJournal?.sourceKind === "safari-zip" ? "Safari ZIP" : recoveryJournal?.sourceKind === "chrome" ? "Chrome bookmark source" : "HTML file"} to verify and resume.
            </p>
            <DataTransferActionBar className="mt-3">
              <Button type="button" plain onClick={discardRecovery}>Discard recovery</Button>
            </DataTransferActionBar>
          </div>
        ) : null}

        {isWriting ? (
          <DataTransferActionBar className="mt-4">
            <Button type="button" outline onClick={() => { cancelRequestedRef.current = true; }}>
              <X className="size-4" aria-hidden="true" />
              Stop after current batch
            </Button>
          </DataTransferActionBar>
        ) : null}

        {preparedImport && recoverySummary && !isBusy ? (
          <div aria-label="Import issue details">
            <ImportIssueDetails title="Failed records" items={failedItems} />
            <ImportIssueDetails title="Unknown outcomes" items={unknownItems} />
          </div>
        ) : null}

        {recoverySummary && preparedImport && !isBusy && recoverySummary.failed > 0 ? (
          <DataTransferActionBar className="mt-4">
            <Button type="button" outline onClick={() => { void retryFailed(); }}>Retry failed records</Button>
            <Button type="button" plain onClick={discardRecovery}>Discard recovery</Button>
          </DataTransferActionBar>
        ) : null}

        <details className="mt-4 rounded-xl border border-gray-200/80 dark:border-[var(--app-line)]/20 bg-gray-50/70 dark:bg-[var(--app-card)]/70 px-4 py-3 text-sm text-gray-600 dark:text-[var(--app-muted)]">
          <summary className="cursor-pointer font-medium text-gray-900 dark:text-[var(--app-ink)]">
            {bookmarkExportGuide ? `How to export bookmarks from ${bookmarkExportGuide.label}` : "How to export bookmarks from your browser"}
          </summary>
          <div className="mt-3 space-y-2.5 leading-6">
            <p>{bookmarkExportGuide?.instructions ?? "Export your bookmarks as an HTML file, or as a ZIP file from Safari."}</p>
            <p className="border-t border-gray-200/80 dark:border-[var(--app-line)]/20 pt-2.5 text-gray-500 dark:text-[var(--app-muted)]">
              After exporting, select Choose file above and open the saved HTML or Safari ZIP file. For another browser, see the{" "}
              <a href={`${WEB_DOCS_URL}/bookmarks#import`} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 dark:text-emerald-300 underline decoration-emerald-700/30 underline-offset-2 hover:decoration-emerald-700">complete export guide</a>.
            </p>
          </div>
        </details>

        {progress ? <p className="mt-3 text-sm text-gray-600 dark:text-[var(--app-muted)]" role="status" aria-live="polite">{progress}</p> : null}
        {status ? (
          <div role={status.type === "error" ? "alert" : "status"} aria-live="polite" className={`mt-3 rounded-xl px-4 py-3 text-sm ${status.type === "error" ? "bg-red-500/10 text-red-700 dark:text-red-300" : status.type === "success" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-sky-500/10 text-sky-700 dark:text-sky-300"}`}>
            <div className="flex items-start gap-2">
              {status.type === "success" ? <Check className="mt-0.5 size-4" aria-hidden="true" /> : null}
              <span>{status.message}</span>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
