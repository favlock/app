import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Cloud,
  LoaderCircle,
  Menu,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { useFolders } from "../hooks/useFoldersQuery";
import { useTags } from "../hooks/useTagsQuery";
import {
  useCreateReadspaceEntry,
  useDeleteReadspaceEntry,
  useReadspace,
  useReadspaceCount,
} from "../hooks/useReadspaceQuery";
import {
  normalizeReaderReference,
  parseReadspaceContent,
  serializeReadspaceContent,
  type ReaderReference,
  type ReadspaceContent,
} from "../lib/readspaceContent";
import type { ReadspaceEntry } from "../types/bookmark";
import type { DashboardLayoutContext } from "./DashboardLayout";
import ReadspaceArticleDialog from "../components/ReadspaceArticleDialog";
import ReadspaceCard from "../components/ReadspaceCard";
import ReadspaceOrganizationDialog from "../components/ReadspaceOrganizationDialog";
import ReadspaceOrganizationFields from "../components/ReadspaceOrganizationFields";
import ChromeExtensionPrompt from "../components/ChromeExtensionPrompt";
import { prepareBookmarkTags } from "../lib/bookmarkWrites";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "../components/ui/dialog";
import { useDebounce } from "../hooks/useDebounce";
import { useReadspaceFullTextSearch } from "../hooks/useReadspaceFullTextSearch";
import { markFirstRetrieval } from "../lib/onboarding";
import { useBookmarks } from "../hooks/useBookmarksQuery";
import {
  useDeleteHighlight,
  useDeleteHighlights,
  useHighlights,
  useUpdateHighlightAnnotation,
  useUpdateHighlightColor,
  type WebHighlight,
} from "../hooks/useHighlightsQuery";
import ReadspaceHighlights from "../components/ReadspaceHighlights";
import HighlightExportDialog from "../components/HighlightExportDialog";
import HighlightAnnotationEditor from "../components/HighlightAnnotationEditor";
import ProUpgradeDialog from "../components/ProUpgradeDialog";
import {
  loadReadspaceView,
  saveReadspaceView,
  type ReadspaceView,
} from "../lib/readspaceViewPreference";
import { startLocalVaultCloudMerge } from "../lib/localVaultCloudMerge";

const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const EXTENSION_READY = "FAVLOCK_CHROME_EXTENSION_READY";
const EXTENSION_PING = "FAVLOCK_CHROME_EXTENSION_PING";
const CAPTURE_REQUEST = "FAVLOCK_READER_CAPTURE_REQUEST";
const CAPTURE_RESULT = "FAVLOCK_READER_CAPTURE_RESULT";
const CAPTURE_DELETE = "FAVLOCK_READER_CAPTURE_DELETE";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function sourceDates(
  reference: Pick<ReaderReference, "publishedAt" | "updatedAt">,
) {
  const dates = [];
  const publishedLabel = reference.publishedAt
    ? dateFormatter.format(new Date(reference.publishedAt))
    : "";
  const updatedLabel = reference.updatedAt
    ? dateFormatter.format(new Date(reference.updatedAt))
    : "";
  if (reference.publishedAt) {
    dates.push(`Published ${publishedLabel}`);
  }
  if (reference.updatedAt && updatedLabel !== publishedLabel) {
    dates.push(`Updated ${updatedLabel}`);
  }
  return dates.join(" · ");
}

function getCaptureParams(search: string) {
  const params = new URLSearchParams(search);
  const extensionId = params.get("chromeExtensionId");
  const captureId = params.get("capture");
  return {
    extensionId:
      extensionId && EXTENSION_ID_PATTERN.test(extensionId)
        ? extensionId
        : null,
    captureId:
      captureId && /^[0-9a-f-]{20,64}$/i.test(captureId) ? captureId : null,
  };
}

function LocalReadspaceCloudOnly() {
  const { setIsMobileSidebarOpen } = useOutletContext<DashboardLayoutContext>();
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="w-full min-w-0 flex-1 space-y-4 lg:space-y-5">
      <header className="px-4 pt-4 sm:px-5 lg:px-1 lg:pt-1">
        <div className="flex items-start gap-3 py-1 sm:py-2">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            className="theme-button-icon -ml-2 inline-flex size-11 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[var(--app-ink)] sm:text-[2rem] sm:leading-tight">
              Readspace
            </h1>
            <p className="mt-1 text-sm text-[var(--app-muted)] sm:text-[0.95rem]">
              Save articles and web highlights to your encrypted cloud vault
            </p>
          </div>
        </div>
      </header>

      <section className="px-3 lg:px-0">
        <div className="app-surface rounded-[1.15rem] px-5 py-12 text-center sm:px-8 sm:py-16">
          <span className="mx-auto inline-flex size-12 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--app-primary)_10%,transparent)] text-[var(--app-primary)]">
            <Cloud size={24} aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-xl font-bold text-[var(--app-ink)]">
            Readspace is a cloud-only feature
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--app-muted)]">
            Connect this local library to a free account to save encrypted
            articles and highlights from the FavLock browser extension.
          </p>
          <Button
            type="button"
            color="emerald"
            className="mt-6"
            onClick={() => {
              if (user?.id) startLocalVaultCloudMerge(user.id);
              navigate("/login?mode=sign-in&reconnect=1&merge=1");
            }}
          >
            Connect a cloud account
          </Button>
        </div>
      </section>
    </div>
  );
}

function CloudReadspace() {
  const { setIsMobileSidebarOpen } = useOutletContext<DashboardLayoutContext>();
  const { user } = useAuth();
  const { cryptoKey, encryptField, keyLoading, triggerUnlock } =
    useEncryption();
  const { data: entries = [], isLoading, error, refetch } = useReadspace();
  const { data: bookmarks = [] } = useBookmarks(null, {
    includeHighlightSources: true,
  });
  const highlightsQuery = useHighlights();
  const deleteHighlight = useDeleteHighlight();
  const deleteHighlights = useDeleteHighlights();
  const updateHighlightAnnotation = useUpdateHighlightAnnotation();
  const updateHighlightColor = useUpdateHighlightColor();
  const { data: readspaceCount = 0 } = useReadspaceCount();
  const { data: accountPlan, isLoading: accountPlanLoading } = useAccountPlan();
  const fullTextSearchEnabled = accountPlan?.id === "pro";
  const highlightCleanupAt = accountPlan?.highlightAccess.cleanupAt ?? null;
  const highlightLimit = accountPlan?.highlightAccess.limit ?? 0;
  const highlightExcess = accountPlan
    ? Math.max(
        0,
        accountPlan.highlightAccess.count - accountPlan.highlightAccess.limit,
      )
    : 0;
  const { data: folders = [], isLoading: foldersLoading } = useFolders();
  const { data: existingTags = [] } = useTags();
  const createEntry = useCreateReadspaceEntry();
  const deleteEntry = useDeleteReadspaceEntry();
  const location = useLocation();
  const navigate = useNavigate();
  const bridgeRef = useRef<HTMLIFrameElement>(null);
  const requestIdRef = useRef<string | null>(null);
  const requestStartedRef = useRef(false);
  const [query, setQuery] = useState(
    () => new URLSearchParams(location.search).get("q") ?? "",
  );
  const [view, setView] = useState<ReadspaceView>(() =>
    new URLSearchParams(location.search).get("view") === "highlights"
      ? "highlights"
      : loadReadspaceView(),
  );
  const [capture, setCapture] = useState<ReaderReference | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureFolderId, setCaptureFolderId] = useState("");
  const [captureTags, setCaptureTags] = useState<string[]>([]);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReadspaceEntry | null>(null);
  const [readTarget, setReadTarget] = useState<{
    entry: ReadspaceEntry;
    content: ReadspaceContent;
  } | null>(null);
  const [organizeTarget, setOrganizeTarget] = useState<ReadspaceEntry | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [highlightDeleteTarget, setHighlightDeleteTarget] =
    useState<WebHighlight | null>(null);
  const [highlightDeleteError, setHighlightDeleteError] = useState<string | null>(null);
  const [annotationTarget, setAnnotationTarget] = useState<WebHighlight | null>(null);
  const [annotationText, setAnnotationText] = useState("");
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [highlightColorError, setHighlightColorError] = useState<string | null>(null);
  const [highlightExportTarget, setHighlightExportTarget] = useState<{
    highlights: WebHighlight[];
    scopeLabel: string;
  } | null>(null);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const { extensionId, captureId } = useMemo(
    () => getCaptureParams(location.search),
    [location.search],
  );
  const extensionOrigin = extensionId
    ? `chrome-extension://${extensionId}`
    : null;

  const parsedEntries = useMemo(
    () =>
      entries
        .map((entry) => ({
          entry,
          content: parseReadspaceContent(entry.content),
        }))
        .filter(
          (
            item,
          ): item is { entry: ReadspaceEntry; content: ReadspaceContent } =>
            !!item.content,
        ),
    [entries],
  );
  const debouncedQuery = useDebounce(query, 150).trim();
  const readspaceSearchQuery = useReadspaceFullTextSearch(
    parsedEntries,
    debouncedQuery,
    100,
    fullTextSearchEnabled,
  );
  const readspaceSearchResult = readspaceSearchQuery.data ?? {
    matches: [],
    total: 0,
  };
  const visibleEntries = debouncedQuery
    ? readspaceSearchResult.matches.map((match) => match.article)
    : parsedEntries;

  async function confirmHighlightDelete() {
    if (!highlightDeleteTarget) return;
    setHighlightDeleteError(null);
    try {
      await deleteHighlight.mutateAsync(highlightDeleteTarget.id);
      setHighlightDeleteTarget(null);
    } catch (highlightError) {
      setHighlightDeleteError(
        highlightError instanceof Error
          ? highlightError.message
          : "Could not delete the encrypted highlight.",
      );
    }
  }

  function openAnnotation(highlight: WebHighlight) {
    if (accountPlan?.id !== "pro") {
      setUpgradeDialogOpen(true);
      return;
    }
    setAnnotationError(null);
    setAnnotationText(highlight.payload.note);
    setAnnotationTarget(highlight);
  }

  async function saveAnnotation(note = annotationText) {
    if (!annotationTarget) return;
    setAnnotationError(null);
    try {
      await updateHighlightAnnotation.mutateAsync({
        highlight: annotationTarget,
        note,
      });
      setAnnotationTarget(null);
      setAnnotationText("");
    } catch (annotationSaveError) {
      setAnnotationError(
        annotationSaveError instanceof Error
          ? annotationSaveError.message
          : "Could not save the encrypted annotation.",
      );
    }
  }

  async function changeHighlightColor(
    highlight: WebHighlight,
    color: WebHighlight["payload"]["color"],
  ) {
    setHighlightColorError(null);
    try {
      await updateHighlightColor.mutateAsync({ highlight, color });
    } catch (colorError) {
      setHighlightColorError(
        colorError instanceof Error
          ? colorError.message
          : "Could not update the highlight color.",
      );
    }
  }
  useEffect(() => {
    const openEntryId = new URLSearchParams(location.search).get("open");
    if (!openEntryId || readTarget?.entry.id === openEntryId) return;
    const target = parsedEntries.find(({ entry }) => entry.id === openEntryId);
    if (target) setReadTarget(target);
  }, [location.search, parsedEntries, readTarget?.entry.id]);
  useEffect(() => {
    if (!extensionOrigin) return;
    const handleMessage = (event: MessageEvent) => {
      if (
        event.origin !== extensionOrigin ||
        event.source !== bridgeRef.current?.contentWindow
      ) {
        return;
      }
      if (event.data?.type === EXTENSION_READY) {
        setBridgeReady(true);
        return;
      }
      if (
        event.data?.type !== CAPTURE_RESULT ||
        event.data?.requestId !== requestIdRef.current
      ) {
        return;
      }
      requestIdRef.current = null;
      const nextCapture = normalizeReaderReference(event.data.capture);
      if (!nextCapture?.html) {
        setCaptureError(
          "This article could not be prepared for encrypted storage. Open reader mode again and retry.",
        );
        return;
      }
      setCapture(nextCapture);
      setCaptureFolderId("");
      setCaptureTags([]);
      setCaptureError(null);
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [extensionOrigin]);

  useEffect(() => {
    if (captureId && !extensionOrigin) {
      setCaptureError(
        "This capture link is incomplete. Open Readspace from the FavLock extension again.",
      );
    }
  }, [captureId, extensionOrigin]);

  useEffect(() => {
    if (
      !bridgeReady ||
      !captureId ||
      !extensionOrigin ||
      !bridgeRef.current?.contentWindow ||
      requestStartedRef.current
    ) {
      return;
    }
    requestStartedRef.current = true;
    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    bridgeRef.current.contentWindow.postMessage(
      { type: CAPTURE_REQUEST, captureId, requestId },
      extensionOrigin,
    );
    const timeout = window.setTimeout(() => {
      if (requestIdRef.current !== requestId) return;
      requestIdRef.current = null;
      setCaptureError(
        "Chrome did not return this capture. Reload the extension and try again.",
      );
    }, 10_000);
    return () => window.clearTimeout(timeout);
  }, [bridgeReady, captureId, extensionOrigin]);

  const clearCaptureQuery = () => {
    navigate("/readspace", { replace: true });
  };

  const saveCapture = async () => {
    setCaptureError(null);
    if (!capture || !captureId || !extensionOrigin || !user) return;
    if (!cryptoKey) {
      triggerUnlock();
      setCaptureError("Unlock FavLock, then save this article again.");
      return;
    }
    if (accountPlan && readspaceCount >= accountPlan.limits.readspace) {
      setCaptureError(
        `Readspace limit reached. Your plan allows ${accountPlan.limits.readspace} saved articles.`,
      );
      return;
    }

    const existingTagNames = new Set(
      existingTags.map((tag) => tag.name.trim().toLowerCase()),
    );
    const newTagCount = new Set(
      captureTags.filter(
        (tag) => !existingTagNames.has(tag.trim().toLowerCase()),
      ),
    ).size;
    if (
      accountPlan &&
      accountPlan.limits.tags > 0 &&
      existingTags.length + newTagCount > accountPlan.limits.tags
    ) {
      setCaptureError(
        `Tag limit reached. You can have at most ${accountPlan.limits.tags} tags.`,
      );
      return;
    }

    try {
      const preparedTags = await prepareBookmarkTags(
        captureTags,
        existingTags,
        encryptField,
      );
      await createEntry.mutateAsync({
        title: await encryptField(capture.title),
        content: await encryptField(serializeReadspaceContent(capture)),
        folderId: captureFolderId || null,
        ...preparedTags,
      });
      bridgeRef.current?.contentWindow?.postMessage(
        { type: CAPTURE_DELETE, captureId },
        extensionOrigin,
      );
      setCapture(null);
      clearCaptureQuery();
    } catch (caughtError) {
      setCaptureError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save this article.",
      );
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deleteEntry.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (caughtError) {
      setDeleteError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not delete this article.",
      );
    }
  };

  return (
    <div className="w-full min-w-0 flex-1 space-y-4 lg:space-y-5">
      {extensionOrigin ? (
        <iframe
          ref={bridgeRef}
          src={`${extensionOrigin}/bookmark-import-bridge.html`}
          title="FavLock reader capture bridge"
          className="hidden"
          tabIndex={-1}
          onLoad={() =>
            bridgeRef.current?.contentWindow?.postMessage(
              { type: EXTENSION_PING },
              extensionOrigin,
            )
          }
        />
      ) : null}

      <header className="px-4 pt-4 sm:px-5 lg:px-1 lg:pt-1">
        <div className="w-full py-1 sm:py-2">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="theme-button-icon -ml-2 inline-flex size-11 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[var(--app-ink)] sm:text-[2rem] sm:leading-tight">
                Readspace
              </h1>
              <p className="mt-1 text-sm text-[var(--app-muted)] sm:text-[0.95rem]">
                Your private articles and web highlights
              </p>
            </div>
          </div>
        </div>
      </header>

      <section className="px-3 lg:px-0">
        <div className="app-surface rounded-[1.15rem] p-3 sm:p-4">
          <ChromeExtensionPrompt
            enabled
            userId={user?.id ?? ""}
            variant="inline"
          />
          <div className="mt-3 flex gap-1 rounded-xl bg-[color-mix(in_oklab,var(--app-line)_7%,transparent)] p-1" role="tablist" aria-label="Readspace content">
            {(["articles", "highlights"] as const).map((nextView) => (
              <button
                key={nextView}
                type="button"
                role="tab"
                aria-selected={view === nextView}
                onClick={() => {
                  setView(nextView);
                  saveReadspaceView(nextView);
                  setQuery("");
                }}
                className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-primary)] ${view === nextView ? "bg-[var(--app-card)] text-[var(--app-ink)] shadow-sm" : "text-[var(--app-muted)] hover:text-[var(--app-ink)]"}`}
              >
                {nextView} {nextView === "highlights" && highlightsQuery.data?.length ? `(${highlightsQuery.data.length})` : ""}
              </button>
            ))}
          </div>
          <div className="mt-3 flex min-h-12 items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_72%,white)] px-3 shadow-sm focus-within:ring-3 focus-within:ring-[color-mix(in_oklab,var(--app-primary)_12%,transparent)]">
            <Search size={18} className="text-[var(--app-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                view === "highlights"
                  ? "Search highlighted text and sources…"
                  : fullTextSearchEnabled
                  ? "Search full article text…"
                  : "Search titles, tags, and collections…"
              }
              aria-label={view === "highlights" ? "Search highlights" : "Search saved articles"}
              className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm outline-none placeholder:text-[var(--app-muted)] sm:text-base"
            />
          </div>
        </div>
      </section>

      {view === "highlights" && highlightCleanupAt && highlightExcess > 0 ? (
        <section className="px-3 lg:px-0" aria-label="Highlight retention notice">
          <div
            className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-5 flex-none text-amber-600" aria-hidden="true" />
              <div>
                <p className="font-semibold">
                  {highlightExcess.toLocaleString()} newer {highlightExcess === 1 ? "highlight" : "highlights"} will be deleted on {dateFormatter.format(new Date(highlightCleanupAt))}.
                </p>
                <p className="mt-1 text-sm leading-5 text-amber-900/80">
                  Free keeps your oldest {highlightLimit.toLocaleString()} highlights. Export or delete the excess, or upgrade to keep everything.
                </p>
              </div>
            </div>
            <Button
              type="button"
              color="amber"
              className="flex-none self-start sm:self-center"
              onClick={() => setUpgradeDialogOpen(true)}
            >
              Upgrade to Pro
            </Button>
          </div>
        </section>
      ) : null}

      {capture || (captureId && !captureError) || captureError ? (
        <section className="px-3 lg:px-0">
          <div className="rounded-xl border border-[color-mix(in_oklab,var(--app-primary)_30%,transparent)] bg-[color-mix(in_oklab,var(--app-primary)_9%,var(--app-card))] p-4 shadow-sm sm:p-5">
            {capture ? (
              <div>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--app-primary)]">
                      <ShieldCheck size={15} /> Encrypted article
                    </p>
                    <h3 className="mt-1 truncate text-lg font-bold">
                      {capture.title}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--app-muted)]">
                      {[capture.siteName, sourceDates(capture)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-1 text-xs text-[var(--app-muted)]">
                      The title, article text, source link, and citation details
                      are encrypted before upload.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" outline onClick={clearCaptureQuery}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      color="emerald"
                      onClick={() => void saveCapture()}
                      disabled={createEntry.isPending || keyLoading}
                    >
                      {createEntry.isPending ? "Saving…" : "Save article"}
                    </Button>
                  </div>
                </div>
                <div className="mt-4 border-t border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] pt-4">
                  <ReadspaceOrganizationFields
                    folders={folders}
                    foldersLoading={foldersLoading}
                    existingTags={existingTags}
                    selectedFolderId={captureFolderId}
                    tags={captureTags}
                    onFolderChange={setCaptureFolderId}
                    onTagsChange={setCaptureTags}
                    disabled={createEntry.isPending}
                  />
                </div>
              </div>
            ) : captureError ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-red-700" role="alert">
                  {captureError}
                </p>
                <Button type="button" outline onClick={clearCaptureQuery}>
                  Dismiss
                </Button>
              </div>
            ) : (
              <p
                className="flex items-center gap-2 text-sm text-[var(--app-muted)]"
                role="status"
              >
                <LoaderCircle className="animate-spin" size={17} /> Receiving
                source details from Chrome…
              </p>
            )}
          </div>
        </section>
      ) : null}

      <section className="px-3 lg:px-0">
        {view === "highlights" && highlightColorError ? (
          <p className="mb-3 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-700" role="alert">
            {highlightColorError}
          </p>
        ) : null}
        {view === "highlights" ? (
          <ReadspaceHighlights
            highlights={highlightsQuery.data ?? []}
            bookmarks={bookmarks}
            articles={parsedEntries}
            query={debouncedQuery}
            loading={highlightsQuery.isLoading}
            error={!!highlightsQuery.error}
            deletingId={deleteHighlight.isPending ? (highlightDeleteTarget?.id ?? null) : null}
            annotatingId={updateHighlightAnnotation.isPending ? (annotationTarget?.id ?? null) : null}
            coloringId={updateHighlightColor.isPending ? (updateHighlightColor.variables?.highlight.id ?? null) : null}
            annotationDisabled={accountPlanLoading || accountPlan?.id !== "pro"}
            annotationProRequired={!accountPlanLoading && accountPlan?.id === "free"}
            onRetry={() => void highlightsQuery.refetch()}
            onAnnotate={openAnnotation}
            onColorChange={(highlight, color) => void changeHighlightColor(highlight, color)}
            onExport={(highlights, scopeLabel) => setHighlightExportTarget({ highlights, scopeLabel })}
            onOpenArticle={(entryId) => {
              const target = parsedEntries.find(({ entry }) => entry.id === entryId);
              if (target) setReadTarget(target);
            }}
            onDelete={(highlight) => {
              setHighlightDeleteError(null);
              setHighlightDeleteTarget(highlight);
            }}
            onDeleteSelected={(selectedHighlights) => deleteHighlights.mutateAsync(selectedHighlights)}
          />
        ) : isLoading ? (
          <div
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            role="status"
          >
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-56 animate-pulse rounded-xl bg-white/50"
              />
            ))}
          </div>
        ) : error ? (
          <div
            className="rounded-xl bg-red-500/10 p-5 text-sm text-red-700"
            role="alert"
          >
            <p>Could not load Readspace.</p>
            <Button
              type="button"
              outline
              className="mt-3"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </div>
        ) : parsedEntries.length === 0 ? (
          <div className="rounded-xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_88%,white)] px-5 py-14 text-center shadow-[0_6px_0_color-mix(in_oklab,var(--app-line)_9%,transparent)]">
            <BookOpen size={42} className="mx-auto text-[var(--app-primary)]" />
            <h3 className="mt-4 text-xl font-bold">Your Readspace is quiet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--app-muted)]">
              Open an article and choose Read in the FavLock extension. Save
              its clean text to your encrypted library.
            </p>
          </div>
        ) : debouncedQuery && readspaceSearchQuery.isLoading ? (
          <div
            className="flex items-center justify-center gap-2 rounded-xl bg-white/55 px-5 py-10 text-sm text-[var(--app-muted)]"
            role="status"
          >
            <LoaderCircle className="size-4 animate-spin" /> Searching
            Readspace…
          </div>
        ) : debouncedQuery && readspaceSearchQuery.error ? (
          <div
            className="rounded-xl bg-red-500/10 p-5 text-sm text-red-700"
            role="alert"
          >
            <p>Could not search Readspace.</p>
            <Button
              type="button"
              outline
              className="mt-3"
              onClick={() => void readspaceSearchQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="rounded-xl bg-white/55 px-5 py-10 text-center text-sm text-[var(--app-muted)]">
            No saved articles match “{debouncedQuery}”.
          </div>
        ) : (
          <div className="space-y-3">
            {debouncedQuery &&
            readspaceSearchResult.total > visibleEntries.length ? (
              <p className="text-sm text-[var(--app-muted)]">
                Showing the top {visibleEntries.length.toLocaleString("en-US")}{" "}
                of {readspaceSearchResult.total.toLocaleString("en-US")}{" "}
                matching articles.
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleEntries.map(({ entry, content }) => (
                <ReadspaceCard
                  key={entry.id}
                  entry={entry}
                  content={content}
                  onOpen={() => {
                    markFirstRetrieval(entry.user_id);
                    setReadTarget({ entry, content });
                  }}
                  onOrganize={() => setOrganizeTarget(entry)}
                  onDelete={() => setDeleteTarget(entry)}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        size="sm"
      >
        <DialogTitle>Move saved article to Trash?</DialogTitle>
        <DialogDescription>
          “{deleteTarget?.title ?? "This article"}” can be restored from Trash
          before its recovery period expires.
        </DialogDescription>
        {deleteError ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {deleteError}
          </p>
        ) : null}
        <DialogActions>
          <Button type="button" plain onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            color="red"
            disabled={deleteEntry.isPending}
            onClick={() => void confirmDelete()}
          >
            {deleteEntry.isPending ? "Deleting…" : "Move to Trash"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!highlightDeleteTarget}
        onClose={() => setHighlightDeleteTarget(null)}
        size="sm"
      >
        <DialogTitle>Move this highlight to Trash?</DialogTitle>
        <DialogDescription>
          You can restore the encrypted highlight during your plan’s recovery period. The source bookmark remains saved.
        </DialogDescription>
        {highlightDeleteError ? (
          <p className="mt-3 text-sm text-red-600" role="alert">{highlightDeleteError}</p>
        ) : null}
        <DialogActions>
          <Button type="button" plain onClick={() => setHighlightDeleteTarget(null)}>Cancel</Button>
          <Button type="button" color="red" disabled={deleteHighlight.isPending} onClick={() => void confirmHighlightDelete()}>
            {deleteHighlight.isPending ? "Moving…" : "Move to Trash"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!annotationTarget}
        onClose={() => {
          if (updateHighlightAnnotation.isPending) return;
          setAnnotationTarget(null);
          setAnnotationError(null);
        }}
        size="sm"
        className="[--gutter:0.5rem]!"
      >
        <HighlightAnnotationEditor
          value={annotationText}
          saving={updateHighlightAnnotation.isPending}
          error={annotationError}
          canRemove={!!annotationTarget?.payload.note}
          onChange={setAnnotationText}
          onCancel={() => {
            setAnnotationTarget(null);
            setAnnotationError(null);
          }}
          onSave={() => void saveAnnotation()}
          onRemove={() => void saveAnnotation("")}
        />
      </Dialog>

      <ProUpgradeDialog
        open={upgradeDialogOpen}
        onClose={() => setUpgradeDialogOpen(false)}
      />

      {highlightExportTarget ? <HighlightExportDialog
        highlights={highlightExportTarget.highlights}
        bookmarks={bookmarks}
        articles={parsedEntries}
        scopeLabel={highlightExportTarget.scopeLabel}
        onClose={() => setHighlightExportTarget(null)}
      /> : null}

      <ReadspaceArticleDialog
        article={readTarget}
        onClose={() => {
          setReadTarget(null);
          const params = new URLSearchParams(location.search);
          if (!params.has("open")) return;
          params.delete("open");
          navigate(
            {
              pathname: location.pathname,
              search: params.toString() ? `?${params.toString()}` : "",
            },
            { replace: true },
          );
        }}
      />

      <ReadspaceOrganizationDialog
        article={organizeTarget}
        onClose={() => setOrganizeTarget(null)}
      />
    </div>
  );
}

export default function Readspace() {
  const { isLocalAccount } = useAuth();
  return isLocalAccount ? <LocalReadspaceCloudOnly /> : <CloudReadspace />;
}
