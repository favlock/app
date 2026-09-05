import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  Menu,
  Puzzle,
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
import { prepareBookmarkTags } from "../lib/bookmarkWrites";
import { CHROME_EXTENSION_URL } from "../lib/appUrls";
import { isGoogleChrome } from "../lib/chromeExtension";
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

const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const EXTENSION_READY = "FAVLOCK_CHROME_EXTENSION_READY";
const EXTENSION_PING = "FAVLOCK_CHROME_EXTENSION_PING";
const CAPTURE_REQUEST = "FAVLOCK_READER_CAPTURE_REQUEST";
const CAPTURE_RESULT = "FAVLOCK_READER_CAPTURE_RESULT";
const CAPTURE_DELETE = "FAVLOCK_READER_CAPTURE_DELETE";
type ExtensionStatus = "installed" | "missing" | "unsupported";

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

export default function Readspace() {
  const { setIsMobileSidebarOpen } = useOutletContext<DashboardLayoutContext>();
  const { user, isLocalAccount } = useAuth();
  const { cryptoKey, encryptField, keyLoading, triggerUnlock } =
    useEncryption();
  const { data: entries = [], isLoading, error, refetch } = useReadspace();
  const { data: readspaceCount = 0 } = useReadspaceCount();
  const { data: accountPlan } = useAccountPlan();
  const fullTextSearchEnabled = accountPlan?.id === "pro";
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
  const { extensionId, captureId } = useMemo(
    () => getCaptureParams(location.search),
    [location.search],
  );
  const extensionOrigin = extensionId
    ? `chrome-extension://${extensionId}`
    : null;
  const extensionStatus: ExtensionStatus = bridgeReady
    ? "installed"
    : isGoogleChrome(navigator.userAgent, navigator.vendor)
      ? "missing"
      : "unsupported";

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
                Reading
              </h1>
              <p className="mt-1 text-sm text-[var(--app-muted)] sm:text-[0.95rem]">
                Your private, distraction-free article library
              </p>
            </div>
          </div>
        </div>
      </header>

      <section className="px-3 lg:px-0">
        <div className="app-surface rounded-[1.15rem] p-3 sm:p-4">
          <div
            className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm leading-5 ${
              extensionStatus === "installed"
                ? "border-emerald-600/20 bg-emerald-500/8 text-emerald-800"
                : "border-[color-mix(in_oklab,var(--app-primary)_18%,transparent)] bg-[color-mix(in_oklab,var(--app-primary)_7%,white)] text-[var(--app-muted)]"
            }`}
            role="status"
          >
            <span
              className={`inline-flex h-5 flex-none items-center justify-center ${
                extensionStatus === "installed" ? "self-start" : "self-center"
              }`}
            >
              {extensionStatus === "installed" ? (
                <CheckCircle2
                  size={17}
                  className="text-emerald-600"
                  aria-hidden="true"
                />
              ) : (
                <Puzzle
                  size={17}
                  className="text-[var(--app-primary)]"
                  aria-hidden="true"
                />
              )}
            </span>
            {extensionStatus === "installed" ? (
              <p>
                FavLock for Chrome is installed. Open any article and use the
                extension to save it to Readspace.
              </p>
            ) : extensionStatus === "missing" ? (
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Install FavLock for Chrome to save articles directly to
                  Readspace.
                </p>
                <a
                  href={CHROME_EXTENSION_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex flex-none items-center gap-1 self-start rounded-sm font-semibold text-[var(--app-primary)] underline decoration-[color-mix(in_oklab,var(--app-primary)_35%,transparent)] underline-offset-2 transition-colors hover:decoration-[var(--app-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-primary)_25%,transparent)] sm:self-center"
                >
                  Get Chrome extension
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </div>
            ) : (
              <p>
                Saving new articles requires the FavLock extension, currently
                available only on Google Chrome. Saved articles can still be
                read here in this browser.
              </p>
            )}
          </div>
          <div className="mt-3 flex min-h-12 items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_72%,white)] px-3 shadow-sm focus-within:ring-3 focus-within:ring-[color-mix(in_oklab,var(--app-primary)_12%,transparent)]">
            <Search size={18} className="text-[var(--app-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                fullTextSearchEnabled
                  ? "Search full article text…"
                  : "Search titles, tags, and collections…"
              }
              aria-label="Search saved articles"
              className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm outline-none placeholder:text-[var(--app-muted)] sm:text-base"
            />
          </div>
        </div>
      </section>

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
                      {[capture.siteName, capture.byline, sourceDates(capture)]
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
        {isLoading ? (
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
        <DialogTitle>{isLocalAccount ? "Delete saved article permanently?" : "Move saved article to Trash?"}</DialogTitle>
        <DialogDescription>
          {isLocalAccount
            ? `“${deleteTarget?.title ?? "This article"}” will be deleted immediately. A free cloud account includes 7 days of Trash retention.`
            : `“${deleteTarget?.title ?? "This article"}” can be restored from Trash before its recovery period expires.`}
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
            {deleteEntry.isPending ? "Deleting…" : isLocalAccount ? "Delete permanently" : "Move to Trash"}
          </Button>
        </DialogActions>
      </Dialog>

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
