import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getBookmarkExportGuideForUserAgent } from "@favlock/shared";
import { LoaderCircle, Check, Download } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { useFolders } from "../hooks/useFoldersQuery";
import {
  RESOURCE_USAGE_QUERY_KEY,
  useResourceUsage,
} from "../hooks/useResourceUsageQuery";
import { getCachedBookmarksForUser } from "../lib/bookmarkCache";
import { WEB_DOCS_URL } from "../lib/appUrls";
import { createFolder } from "../lib/taxonomyRepository";
import {
  createBookmark,
  moveBookmarkToFolder,
  overwriteBookmarkImportContent,
} from "../lib/bookmarkRepository";
import {
  folderPathKey,
  folderPathLabel,
  getExistingFolderIdByPath,
  getImportFolderPaths,
  getImportedBookmarkTitle,
  normalizeImportedBookmarkUrl,
  parseBrowserBookmarksFile,
  parseChromeBookmarksTree,
  toSupportedFolderPath,
  type BrowserBookmarkImportResult,
} from "../lib/browserBookmarkImport";
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

type DuplicateResolution = "skip" | "keep" | "overwrite";

type DuplicateConflict = {
  itemIndex: number;
  importedTitle: string;
  importedUrl: string;
  existingBookmark: {
    id: string;
    title: string;
    url: string;
  };
};

type DuplicateDecision = {
  resolution: DuplicateResolution;
  existingBookmarkId: string;
};

type PendingDuplicateReview = {
  importResult: BrowserBookmarkImportResult;
  conflicts: DuplicateConflict[];
  currentIndex: number;
  decisions: Map<number, DuplicateDecision>;
};

const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const CHROME_BOOKMARK_REQUEST = "FAVLOCK_CHROME_BOOKMARKS_REQUEST";
const CHROME_BOOKMARK_RESULT = "FAVLOCK_CHROME_BOOKMARKS_RESULT";
const CHROME_EXTENSION_READY = "FAVLOCK_CHROME_EXTENSION_READY";
const CHROME_EXTENSION_PING = "FAVLOCK_CHROME_EXTENSION_PING";

function getChromeExtensionId(search: string): string | null {
  const extensionId = new URLSearchParams(search).get("chromeExtensionId");

  return extensionId && CHROME_EXTENSION_ID_PATTERN.test(extensionId)
    ? extensionId
    : null;
}

function shouldAutoImportChromeBookmarks(search: string): boolean {
  return new URLSearchParams(search).get("autoImport") === "chrome";
}

export default function BrowserBookmarkImportSection() {
  const { user, session, retryBookmarkCacheSync } = useAuth();
  const accessToken = session?.access_token ?? "";
  const { cryptoKey, encryptField, keyLoading } = useEncryption();
  const { data: folders = [], isLoading: foldersLoading } = useFolders();
  const { data: accountPlan, refetch: refetchAccountPlan } = useAccountPlan();
  const { data: resourceUsage, refetch: refetchResourceUsage } =
    useResourceUsage();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chromeBridgeRef = useRef<HTMLIFrameElement>(null);
  const pendingChromeRequestRef = useRef<string | null>(null);
  const chromeRequestTimeoutRef = useRef<number | null>(null);
  const autoChromeImportStartedRef = useRef(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isChromeExtensionReady, setIsChromeExtensionReady] = useState(false);
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

  const existingFolderMap = useMemo(
    () => getExistingFolderIdByPath(folders),
    [folders],
  );

  const resetInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const findDuplicateConflicts = useCallback(
    async ({ bookmarks }: BrowserBookmarkImportResult) => {
      if (!user) {
        throw new Error("You must be signed in to import bookmarks.");
      }

      setProgress("Checking for duplicate bookmarks...");
      const existingBookmarks = await getCachedBookmarksForUser(user.id);
      const existingByUrl = new Map<string, (typeof existingBookmarks)[number]>();

      for (const bookmark of existingBookmarks) {
        const normalizedUrl = normalizeImportedBookmarkUrl(bookmark.url);
        if (normalizedUrl && !existingByUrl.has(normalizedUrl)) {
          existingByUrl.set(normalizedUrl, bookmark);
        }
      }

      const conflicts: DuplicateConflict[] = [];
      bookmarks.forEach((bookmark, itemIndex) => {
        const normalizedUrl = normalizeImportedBookmarkUrl(bookmark.url);
        if (!normalizedUrl) return;

        const existingBookmark = existingByUrl.get(normalizedUrl);
        if (!existingBookmark) return;

        conflicts.push({
          itemIndex,
          importedTitle: getImportedBookmarkTitle(
            bookmark.title,
            normalizedUrl,
          ),
          importedUrl: normalizedUrl,
          existingBookmark,
        });
      });

      return conflicts;
    },
    [user],
  );

  const importBookmarks = useCallback(
    async (
      {
        bookmarks: importedItems,
        folderPaths: importedFolderPaths,
      }: BrowserBookmarkImportResult,
      duplicateDecisions: Map<number, DuplicateDecision>,
    ) => {
      if (!user || !accessToken) {
        throw new Error("You must be signed in to import bookmarks.");
      }

      if (importedItems.length === 0) {
        throw new Error("No bookmarks were found to import.");
      }

      const folderPaths = getImportFolderPaths([
        ...importedFolderPaths,
        ...importedItems.map((item) => item.folderPath),
      ]);

      const validBookmarkCount = importedItems.filter((item, index) => {
        if (!normalizeImportedBookmarkUrl(item.url)) return false;
        const resolution = duplicateDecisions.get(index)?.resolution;
        return resolution !== "skip" && resolution !== "overwrite";
      }).length;
      const newFolderCount = folderPaths.filter(
        (folderPath) => !existingFolderMap.has(folderPathKey(folderPath)),
      ).length;
      const effectivePlan = accountPlan ?? (await refetchAccountPlan()).data;
      if (!effectivePlan) {
        throw new Error("Could not load your account limits. Try again.");
      }
      const effectiveUsage =
        resourceUsage ?? (await refetchResourceUsage()).data;
      if (!effectiveUsage) {
        throw new Error("Could not load your account usage. Try again.");
      }

      if (
        effectiveUsage.bookmarks + validBookmarkCount >
        effectivePlan.limits.bookmarks
      ) {
        throw new Error(
          `This import would exceed the ${effectivePlan.limits.bookmarks}-bookmark limit.`,
        );
      }

      if (
        effectivePlan.limits.collections > 0 &&
        effectiveUsage.collections + newFolderCount >
        effectivePlan.limits.collections
      ) {
        throw new Error(
          `This import would exceed the ${effectivePlan.limits.collections}-collection limit.`,
        );
      }

      const folderIdByPath = new Map(existingFolderMap);
      let createdFolders = 0;
      const nextSortOrderByParentId = new Map<string | null, number>();

      for (const folder of folders) {
        const nextSortOrder = nextSortOrderByParentId.get(folder.parent_id) ?? 0;
        nextSortOrderByParentId.set(
          folder.parent_id,
          Math.max(nextSortOrder, (folder.sort_order ?? 0) + 1),
        );
      }

      for (const folderPath of folderPaths) {
        const key = folderPathKey(folderPath);
        if (folderIdByPath.has(key)) continue;

        const displayName = folderPathLabel(folderPath);
        setProgress(`Creating collection "${displayName}"...`);

        const parentPath = folderPath.slice(0, -1);
        const parentId = parentPath.length
          ? folderIdByPath.get(folderPathKey(parentPath))
          : null;

        if (parentPath.length && !parentId) {
          throw new Error(
            `Could not create parent collection "${folderPathLabel(parentPath)}".`,
          );
        }

        const sortOrder = nextSortOrderByParentId.get(parentId ?? null) ?? 0;

        const created = await createFolder(accessToken, {
          encryptedName: await encryptField(
            folderPath[folderPath.length - 1],
          ),
          color: null,
          parentId: parentId ?? null,
          sortOrder,
        });

        folderIdByPath.set(key, created.folderId);
        createdFolders += 1;
        nextSortOrderByParentId.set(parentId ?? null, sortOrder + 1);
      }

      let importedBookmarks = 0;
      let overwrittenBookmarks = 0;
      let skippedDuplicateBookmarks = 0;
      let skippedBookmarks = 0;

      for (let index = 0; index < importedItems.length; index += 1) {
        const item = importedItems[index];
        const normalizedUrl = normalizeImportedBookmarkUrl(item.url);
        const duplicateDecision = duplicateDecisions.get(index);

        if (!normalizedUrl) {
          skippedBookmarks += 1;
          continue;
        }

        if (duplicateDecision?.resolution === "skip") {
          skippedDuplicateBookmarks += 1;
          continue;
        }

        const title = getImportedBookmarkTitle(item.title, normalizedUrl);
        setProgress(`Importing bookmark ${index + 1} of ${importedItems.length}...`);

        const folderPath = toSupportedFolderPath(item.folderPath);
        const folderId = folderPath.length
          ? folderIdByPath.get(folderPathKey(folderPath)) ?? null
          : null;

        if (duplicateDecision?.resolution === "overwrite") {
          await overwriteBookmarkImportContent(
            accessToken,
            duplicateDecision.existingBookmarkId,
            await encryptField(title),
            await encryptField(normalizedUrl),
          );
          await moveBookmarkToFolder(
            accessToken,
            duplicateDecision.existingBookmarkId,
            folderId,
          );
          overwrittenBookmarks += 1;
          continue;
        }

        await createBookmark(accessToken, {
          title: await encryptField(title),
          url: await encryptField(normalizedUrl),
          folderId,
          existingTagIds: [],
          newEncryptedTagNames: [],
        });

        importedBookmarks += 1;
      }

      await queryClient.invalidateQueries({ queryKey: ["folders"] });
      await queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      await queryClient.invalidateQueries({
        queryKey: RESOURCE_USAGE_QUERY_KEY,
      });
      retryBookmarkCacheSync();

      setStatus({
        type: "success",
        message: `Import complete: ${importedBookmarks} added, ${overwrittenBookmarks} overwritten, ${skippedDuplicateBookmarks} duplicates skipped${createdFolders ? `, ${createdFolders} collections created` : ""}${skippedBookmarks ? `, ${skippedBookmarks} invalid entries skipped` : ""}.`,
      });
    },
    [
      accountPlan,
      encryptField,
      existingFolderMap,
      folders,
      queryClient,
      refetchAccountPlan,
      refetchResourceUsage,
      resourceUsage,
      retryBookmarkCacheSync,
      accessToken,
      user,
    ],
  );

  const runImport = useCallback(
    async (
      loadImport: () => Promise<BrowserBookmarkImportResult>,
      initialProgress: string,
    ) => {
      setIsImporting(true);
      setProgress(initialProgress);
      setStatus(null);
      let waitingForDuplicateChoices = false;

      try {
        const importResult = await loadImport();
        const conflicts = await findDuplicateConflicts(importResult);

        if (conflicts.length > 0) {
          waitingForDuplicateChoices = true;
          setProgress(null);
          setApplyDuplicateChoiceToAll(false);
          setPendingDuplicateReview({
            importResult,
            conflicts,
            currentIndex: 0,
            decisions: new Map(),
          });
          return;
        }

        await importBookmarks(importResult, new Map());
      } catch (error) {
        setStatus({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not import bookmarks.",
        });
      } finally {
        if (!waitingForDuplicateChoices) {
          setProgress(null);
          setIsImporting(false);
        }
      }
    },
    [findDuplicateConflicts, importBookmarks],
  );

  const finishReviewedImport = useCallback(
    async (
      importResult: BrowserBookmarkImportResult,
      decisions: Map<number, DuplicateDecision>,
    ) => {
      setPendingDuplicateReview(null);
      setApplyDuplicateChoiceToAll(false);
      setProgress("Preparing bookmark import...");

      try {
        await importBookmarks(importResult, decisions);
      } catch (error) {
        setStatus({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not import bookmarks.",
        });
      } finally {
        setProgress(null);
        setIsImporting(false);
      }
    },
    [importBookmarks],
  );

  const handleDuplicateResolution = (resolution: DuplicateResolution) => {
    if (!pendingDuplicateReview) return;

    const decisions = new Map(pendingDuplicateReview.decisions);
    const currentConflict =
      pendingDuplicateReview.conflicts[pendingDuplicateReview.currentIndex];
    decisions.set(currentConflict.itemIndex, {
      resolution,
      existingBookmarkId: currentConflict.existingBookmark.id,
    });

    if (applyDuplicateChoiceToAll) {
      for (
        let index = pendingDuplicateReview.currentIndex + 1;
        index < pendingDuplicateReview.conflicts.length;
        index += 1
      ) {
        const conflict = pendingDuplicateReview.conflicts[index];
        decisions.set(conflict.itemIndex, {
          resolution,
          existingBookmarkId: conflict.existingBookmark.id,
        });
      }

      void finishReviewedImport(
        pendingDuplicateReview.importResult,
        decisions,
      );
      return;
    }

    const nextIndex = pendingDuplicateReview.currentIndex + 1;
    if (nextIndex < pendingDuplicateReview.conflicts.length) {
      setPendingDuplicateReview({
        ...pendingDuplicateReview,
        currentIndex: nextIndex,
        decisions,
      });
      return;
    }

    void finishReviewedImport(pendingDuplicateReview.importResult, decisions);
  };

  const cancelDuplicateReview = () => {
    setPendingDuplicateReview(null);
    setApplyDuplicateChoiceToAll(false);
    setProgress(null);
    setIsImporting(false);
    setStatus({
      type: "info",
      message: "Import canceled. No changes were made.",
    });
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    await runImport(
      () => parseBrowserBookmarksFile(file),
      file.name.toLowerCase().endsWith(".zip")
        ? "Reading Safari bookmark archive..."
        : "Reading bookmark export...",
    );
    resetInput();
  };

  useEffect(() => {
    if (!chromeExtensionOrigin) return;

    const handleChromeMessage = (event: MessageEvent) => {
      if (
        event.origin !== chromeExtensionOrigin ||
        event.source !== chromeBridgeRef.current?.contentWindow
      ) {
        return;
      }

      if (event.data?.type === CHROME_EXTENSION_READY) {
        setIsChromeExtensionReady(true);
        return;
      }

      if (
        event.data?.type !== CHROME_BOOKMARK_RESULT ||
        event.data?.requestId !== pendingChromeRequestRef.current
      ) {
        return;
      }

      pendingChromeRequestRef.current = null;
      if (chromeRequestTimeoutRef.current !== null) {
        window.clearTimeout(chromeRequestTimeoutRef.current);
        chromeRequestTimeoutRef.current = null;
      }

      if (typeof event.data.error === "string") {
        setProgress(null);
        setIsImporting(false);
        setStatus({ type: "error", message: event.data.error });
        return;
      }

      void runImport(
        async () => parseChromeBookmarksTree(event.data.tree),
        "Reading Chrome bookmarks...",
      );
    };

    window.addEventListener("message", handleChromeMessage);
    return () => window.removeEventListener("message", handleChromeMessage);
  }, [chromeExtensionOrigin, runImport]);

  useEffect(
    () => () => {
      if (chromeRequestTimeoutRef.current !== null) {
        window.clearTimeout(chromeRequestTimeoutRef.current);
      }
    },
    [],
  );

  const handleChromeImport = useCallback(() => {
    if (!chromeExtensionOrigin || !chromeBridgeRef.current?.contentWindow) {
      setStatus({
        type: "error",
        message: "Open this import screen from the FavLock Chrome extension.",
      });
      return;
    }

    if (!isChromeExtensionReady) {
      setStatus({
        type: "error",
        message:
          "Could not connect to the Chrome extension. Reload the extension and open this screen again.",
      });
      return;
    }

    const requestId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    pendingChromeRequestRef.current = requestId;
    setSelectedFileName(null);
    setIsImporting(true);
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
      setIsImporting(false);
      setStatus({
        type: "error",
        message: "Chrome did not respond. Reload the extension and try again.",
      });
    }, 10_000);
  }, [chromeExtensionOrigin, isChromeExtensionReady]);

  const handleChromeBridgeLoad = () => {
    if (!chromeExtensionOrigin || !chromeBridgeRef.current?.contentWindow) {
      return;
    }

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
      foldersLoading ||
      !isChromeExtensionReady
    ) {
      return;
    }

    autoChromeImportStartedRef.current = true;
    const nextSearchParams = new URLSearchParams(location.search);
    nextSearchParams.delete("autoImport");
    const nextSearch = nextSearchParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
        hash: location.hash,
      },
      { replace: true },
    );
    handleChromeImport();
  }, [
    autoImportChromeBookmarks,
    cryptoKey,
    foldersLoading,
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

  return (
    <>
      <Dialog
        open={Boolean(activeDuplicateConflict)}
        onClose={cancelDuplicateReview}
        size="lg"
      >
        <DialogTitle>Duplicate bookmark found</DialogTitle>
        <DialogDescription>
          This URL is already in your FavLock library. Choose what to do before
          the import continues.
        </DialogDescription>

        {activeDuplicateConflict && pendingDuplicateReview ? (
          <div className="mt-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Duplicate {pendingDuplicateReview.currentIndex + 1} of{" "}
              {pendingDuplicateReview.conflicts.length}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Existing bookmark
                </p>
                <p className="mt-2 truncate text-sm font-semibold text-gray-900">
                  {activeDuplicateConflict.existingBookmark.title}
                </p>
                <p className="mt-1 break-all text-xs text-gray-500">
                  {activeDuplicateConflict.existingBookmark.url}
                </p>
              </div>

              <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Imported bookmark
                </p>
                <p className="mt-2 truncate text-sm font-semibold text-gray-900">
                  {activeDuplicateConflict.importedTitle}
                </p>
                <p className="mt-1 break-all text-xs text-gray-500">
                  {activeDuplicateConflict.importedUrl}
                </p>
              </div>
            </div>

            <p className="text-sm leading-6 text-gray-600">
              Overwrite replaces the existing title, URL, and collection while
              preserving its tags and favorite status.
            </p>

            <CheckboxField>
              <Checkbox
                color="emerald"
                checked={applyDuplicateChoiceToAll}
                onChange={setApplyDuplicateChoiceToAll}
              />
              <Label>Apply this choice to all remaining duplicates</Label>
            </CheckboxField>
          </div>
        ) : null}

        <DialogActions className="sm:flex-wrap">
          <Button type="button" plain onClick={cancelDuplicateReview}>
            Cancel import
          </Button>
          <Button
            type="button"
            outline
            onClick={() => handleDuplicateResolution("skip")}
          >
            Skip
          </Button>
          <Button
            type="button"
            color="emerald"
            onClick={() => handleDuplicateResolution("keep")}
          >
            Keep both
          </Button>
          <Button
            type="button"
            color="amber"
            onClick={() => handleDuplicateResolution("overwrite")}
          >
            Overwrite
          </Button>
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
          <iframe
            ref={chromeBridgeRef}
            src={`${chromeExtensionOrigin}/bookmark-import-bridge.html`}
            title="FavLock Chrome bookmark importer"
            className="hidden"
            tabIndex={-1}
            onLoad={handleChromeBridgeLoad}
          />
        ) : null}

        <Field className="mt-6">
          <Label htmlFor="browser-bookmark-import-file">Bookmark export</Label>
          <Description id="browser-bookmark-import-file-description">
            Choose an HTML export or Safari ZIP file.
          </Description>
          <DataTransferFileControl
            id="browser-bookmark-import-file"
            descriptionId="browser-bookmark-import-file-description"
            inputRef={fileInputRef}
            accept=".html,.htm,.zip,text/html,application/zip,application/x-zip-compressed"
            fileName={selectedFileName}
            emptyLabel="No bookmark file selected"
            disabled={isImporting || keyLoading || foldersLoading}
            busy={isImporting}
            busyLabel="Importing..."
            onChange={(event) => {
              void handleImportFile(event);
            }}
          />
        </Field>

        {chromeExtensionId ? (
          <DataTransferActionBar className="mt-4">
            <Button
              type="button"
              color="emerald"
              disabled={
                isImporting || !cryptoKey || keyLoading || foldersLoading
              }
              onClick={handleChromeImport}
            >
              {isImporting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {isImporting ? "Importing..." : "Import from Chrome"}
            </Button>
          </DataTransferActionBar>
        ) : null}

        <details className="mt-4 rounded-xl border border-gray-200/80 bg-gray-50/70 px-4 py-3 text-sm text-gray-600">
          <summary className="cursor-pointer font-medium text-gray-900">
            {bookmarkExportGuide
              ? `How to export bookmarks from ${bookmarkExportGuide.label}`
              : "How to export bookmarks from your browser"}
          </summary>
          <div className="mt-3 space-y-2.5 leading-6">
            {bookmarkExportGuide ? (
              <p>{bookmarkExportGuide.instructions}</p>
            ) : (
              <p>
                Export your bookmarks as an HTML file, or as a ZIP file from
                Safari.
              </p>
            )}
            <p className="border-t border-gray-200/80 pt-2.5 text-gray-500">
              After exporting, select Choose file above and open the saved HTML
              or Safari ZIP file. For another browser, see the{" "}
              <a
                href={`${WEB_DOCS_URL}/bookmarks#import`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-emerald-700 underline decoration-emerald-700/30 underline-offset-2 hover:decoration-emerald-700"
              >
                complete export guide
              </a>
              .
            </p>
          </div>
        </details>

        {progress ? (
          <p
            className="mt-3 text-sm text-gray-600 "
            role="status"
            aria-live="polite"
          >
            {progress}
          </p>
        ) : null}

        {status ? (
          <div
            role={status.type === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`mt-3 rounded-xl px-4 py-3 text-sm ${
              status.type === "error"
                ? "bg-red-500/10 text-red-600 "
                : status.type === "success"
                  ? "bg-emerald-500/10 text-emerald-600 "
                  : "bg-sky-500/10 text-sky-600 "
            }`}
          >
            <div className="flex items-start gap-2">
              {status.type === "success" ? (
                <Check className="mt-0.5 size-4" aria-hidden="true" />
              ) : null}
              <span>{status.message}</span>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
