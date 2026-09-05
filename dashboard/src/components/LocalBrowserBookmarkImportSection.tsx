import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LOCAL_PLAN } from "@favlock/shared";
import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import {
  folderPathLabel,
  parseBrowserBookmarksFile,
} from "../lib/browserBookmarkImport";
import {
  prepareBrowserBookmarkImport,
  type BrowserBookmarkImportPreview,
} from "../lib/browserBookmarkImportPlan";
import {
  importLocalBookmarks,
  readLocalBookmarks,
  readLocalFolders,
  type LocalBookmarkImportItem,
} from "../lib/localVault";
import { setLibraryPopulated } from "../lib/onboarding";
import { Button } from "./ui/button";
import { Checkbox, CheckboxField } from "./ui/checkbox";
import {
  DataTransferActionBar,
  DataTransferFileControl,
  DataTransferSectionHeader,
} from "./DataTransferControls";
import { Description, Field, Label } from "./ui/fieldset";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

type DuplicateDecision = "skip" | "keep" | "overwrite";

type ImportStatus = {
  type: "success" | "error" | "info";
  message: string;
};

function messageFor(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "FavLock could not import these bookmarks.";
}

export default function LocalBrowserBookmarkImportSection() {
  const { user, isLocalAccount, retryBookmarkCacheSync } = useAuth();
  const { cryptoKey, keyLoading, triggerUnlock } = useEncryption();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<BrowserBookmarkImportPreview | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [duplicateReviewIndex, setDuplicateReviewIndex] = useState<number | null>(null);
  const [duplicateDecisions, setDuplicateDecisions] = useState<
    Map<number, DuplicateDecision>
  >(new Map());
  const [applyToAll, setApplyToAll] = useState(false);

  const libraryDuplicates = useMemo(
    () => preview?.items.filter((item) => item.duplicate === "library") ?? [],
    [preview],
  );
  const activeDuplicate = duplicateReviewIndex === null
    ? null
    : libraryDuplicates[duplicateReviewIndex] ?? null;

  const resetPreview = () => {
    setPreview(null);
    setStatus(null);
    setDuplicateReviewIndex(null);
    setDuplicateDecisions(new Map());
    setApplyToAll(false);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    resetPreview();
    setFileName(file?.name ?? null);
    if (!file) return;
    if (!user || !isLocalAccount) {
      setStatus({ type: "error", message: "Open a local vault before importing." });
      return;
    }
    if (!cryptoKey) {
      triggerUnlock();
      setStatus({ type: "error", message: "Unlock the local vault before importing." });
      return;
    }

    setIsPreparing(true);
    try {
      const result = await parseBrowserBookmarksFile(file);
      const [bookmarks, folders] = await Promise.all([
        readLocalBookmarks(user.id, cryptoKey),
        readLocalFolders(user.id, cryptoKey),
      ]);
      const prepared = await prepareBrowserBookmarkImport(
        result,
        bookmarks,
        folders,
        LOCAL_PLAN,
        { bookmarks: bookmarks.length, collections: folders.length },
      );
      setPreview(prepared);
      setStatus({
        type: prepared.blockedReason ? "error" : "info",
        message: prepared.blockedReason ?? "Preview ready. Nothing has been written yet.",
      });
    } catch (error) {
      setStatus({ type: "error", message: messageFor(error) });
    } finally {
      setIsPreparing(false);
    }
  };

  const finishImport = async (
    decisions: Map<number, DuplicateDecision>,
  ) => {
    if (!preview || !user || !isLocalAccount || !cryptoKey) return;
    const items: LocalBookmarkImportItem[] = preview.items.flatMap((item) => {
      if (item.duplicate === "source") return [];
      if (item.duplicate === null) {
        return [{ title: item.title, url: item.url, folderPath: item.folderPath }];
      }
      const decision = decisions.get(item.index) ?? "skip";
      if (decision === "skip") return [];
      return [{
        title: item.title,
        url: item.url,
        folderPath: item.folderPath,
        ...(decision === "overwrite" && item.existingBookmark
          ? { overwriteBookmarkId: item.existingBookmark.id }
          : {}),
      }];
    });

    setIsImporting(true);
    setStatus(null);
    try {
      const result = await importLocalBookmarks(user.id, items, cryptoKey);
      const skipped = preview.invalidCount + preview.sourceDuplicateCount +
        libraryDuplicates.filter((item) => decisions.get(item.index) === "skip").length;
      setLibraryPopulated(
        user.id,
        preview.bookmarkUsage + result.added > 0,
      );
      retryBookmarkCacheSync();
      for (const queryKey of [
        ["bookmarks"],
        ["folders"],
        ["tags"],
        ["resource-usage"],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      setStatus({
        type: "success",
        message: `${result.added.toLocaleString()} added, ${result.overwritten.toLocaleString()} overwritten, ${skipped.toLocaleString()} skipped. ${result.collectionsCreated.toLocaleString()} Collection${result.collectionsCreated === 1 ? "" : "s"} created.`,
      });
      setPreview(null);
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setStatus({ type: "error", message: messageFor(error) });
    } finally {
      setIsImporting(false);
    }
  };

  const startImport = () => {
    if (!preview || preview.blockedReason) return;
    if (libraryDuplicates.length > 0) {
      setDuplicateDecisions(new Map());
      setDuplicateReviewIndex(0);
      return;
    }
    void finishImport(new Map());
  };

  const chooseDuplicate = (decision: DuplicateDecision) => {
    if (duplicateReviewIndex === null || !activeDuplicate) return;
    const decisions = new Map(duplicateDecisions);
    if (applyToAll) {
      for (const duplicate of libraryDuplicates.slice(duplicateReviewIndex)) {
        decisions.set(duplicate.index, decision);
      }
      setDuplicateReviewIndex(null);
      setApplyToAll(false);
      void finishImport(decisions);
      return;
    }
    decisions.set(activeDuplicate.index, decision);
    const nextIndex = duplicateReviewIndex + 1;
    if (nextIndex < libraryDuplicates.length) {
      setDuplicateDecisions(decisions);
      setDuplicateReviewIndex(nextIndex);
      return;
    }
    setDuplicateReviewIndex(null);
    setDuplicateDecisions(new Map());
    void finishImport(decisions);
  };

  return (
    <>
      <Dialog
        open={!!activeDuplicate}
        onClose={() => {
          setDuplicateReviewIndex(null);
          setDuplicateDecisions(new Map());
          setApplyToAll(false);
        }}
        size="lg"
      >
        <DialogTitle>Review duplicate bookmark</DialogTitle>
        <DialogDescription>
          Choose what to do with duplicate {duplicateReviewIndex === null ? 0 : duplicateReviewIndex + 1} of {libraryDuplicates.length}.
        </DialogDescription>
        {activeDuplicate?.existingBookmark ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-gray-200 dark:border-[var(--app-line)]/20 bg-gray-50 dark:bg-[var(--app-card)] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-[var(--app-muted)]">Existing bookmark</p>
                <p className="mt-2 truncate text-sm font-semibold text-gray-900 dark:text-[var(--app-ink)]">{activeDuplicate.existingBookmark.title}</p>
                <p className="mt-1 break-all text-xs text-gray-500 dark:text-[var(--app-muted)]">{activeDuplicate.existingBookmark.url}</p>
              </div>
              <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50/60 dark:bg-[var(--app-mint)] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Imported bookmark</p>
                <p className="mt-2 truncate text-sm font-semibold text-gray-900 dark:text-[var(--app-ink)]">{activeDuplicate.title}</p>
                <p className="mt-1 break-all text-xs text-gray-500 dark:text-[var(--app-muted)]">{activeDuplicate.url}</p>
                <p className="mt-2 text-xs text-gray-500 dark:text-[var(--app-muted)]">Collection: {activeDuplicate.folderPath.length ? folderPathLabel(activeDuplicate.folderPath) : "None"}</p>
              </div>
            </div>
            <p className="text-sm leading-6 text-gray-600 dark:text-[var(--app-muted)]">
              Overwrite updates the title, URL, and Collection while preserving Tags and favorite status.
            </p>
            <CheckboxField>
              <Checkbox color="emerald" checked={applyToAll} onChange={setApplyToAll} />
              <Label>Apply this choice to all remaining duplicates</Label>
            </CheckboxField>
          </div>
        ) : null}
        <DialogActions className="sm:flex-wrap">
          <Button type="button" plain onClick={() => {
            setDuplicateReviewIndex(null);
            setDuplicateDecisions(new Map());
          }}>Cancel import</Button>
          <Button type="button" outline onClick={() => chooseDuplicate("skip")}>Skip</Button>
          <Button type="button" color="emerald" onClick={() => chooseDuplicate("keep")}>Keep both</Button>
          <Button type="button" color="amber" onClick={() => chooseDuplicate("overwrite")}>Overwrite</Button>
        </DialogActions>
      </Dialog>

      <section aria-labelledby="local-bookmark-import-heading">
        <DataTransferSectionHeader
          id="local-bookmark-import-heading"
          title="Import bookmarks locally"
          description="Import an HTML export from Chrome, Edge, or Firefox, or a Safari ZIP. Bookmark titles, URLs, and Collection names are encrypted before they are saved."
        />

        <Field className="mt-6">
          <Label htmlFor="local-browser-bookmark-import-file">Bookmark export</Label>
          <Description id="local-browser-bookmark-import-file-description">
            FavLock previews duplicates and the 250-bookmark allowance before writing anything.
          </Description>
          <DataTransferFileControl
            id="local-browser-bookmark-import-file"
            descriptionId="local-browser-bookmark-import-file-description"
            inputRef={fileInputRef}
            accept=".html,.htm,.zip,text/html,application/zip,application/x-zip-compressed"
            fileName={fileName}
            emptyLabel="No bookmark file selected"
            disabled={isPreparing || isImporting || keyLoading}
            busy={isPreparing || isImporting}
            busyLabel={isImporting ? "Importing..." : "Preparing..."}
            onChange={(event) => void handleFile(event)}
          />
        </Field>

        {preview ? (
          <div className="mt-5 rounded-2xl border border-gray-200 dark:border-[var(--app-line)]/20 bg-gray-50/70 dark:bg-[var(--app-card)]/70 p-4" aria-label="Import preview">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-[var(--app-ink)]">Import preview</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-[var(--app-muted)]">Nothing is written until you continue.</p>
              </div>
              <span className="rounded-full bg-[var(--app-highlight)] px-3 py-1 text-xs font-medium text-gray-600 dark:text-[var(--app-muted)] ring-1 ring-gray-200 dark:ring-[var(--app-line)]">
                {preview.availableBookmarks?.toLocaleString() ?? "Unlimited"} spaces available
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Valid records", preview.validCount],
                ["Duplicates", preview.duplicateCount],
                ["Invalid", preview.invalidCount],
                ["New Collections", preview.newFolderPaths.length],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-[var(--app-highlight)] p-3 ring-1 ring-gray-200/80 dark:ring-[var(--app-line)]/80">
                  <dt className="text-xs text-gray-500 dark:text-[var(--app-muted)]">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-[var(--app-ink)]">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-[var(--app-muted)]">
              {preview.readyToAddCount} can be added immediately. {preview.libraryDuplicateCount} existing duplicates need a choice; {preview.sourceDuplicateCount} repeated records in the file will be skipped.
            </p>
            {preview.invalidItems.length > 0 ? (
              <details className="mt-3 rounded-xl border border-gray-200 dark:border-[var(--app-line)]/20 bg-[var(--app-highlight)] px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium text-gray-900 dark:text-[var(--app-ink)]">Invalid or unsupported records ({preview.invalidItems.length})</summary>
                <ul className="mt-3 space-y-3">
                  {preview.invalidItems.slice(0, 25).map((item) => (
                    <li key={item.index} className="min-w-0">
                      <p className="truncate font-medium text-gray-900 dark:text-[var(--app-ink)]">{item.title}</p>
                      <p className="break-all text-xs text-red-700 dark:text-red-300">{item.url}</p>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {preview.blockedReason ? (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300" role="alert">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {preview.blockedReason}
              </p>
            ) : (
              <DataTransferActionBar className="mt-4">
                <Button type="button" color="emerald" disabled={isImporting} onClick={startImport}>
                  {isImporting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
                  {libraryDuplicates.length > 0 ? "Review duplicates and import" : "Import bookmarks"}
                </Button>
              </DataTransferActionBar>
            )}
          </div>
        ) : null}

        {status ? (
          <div
            role={status.type === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`mt-4 rounded-xl px-4 py-3 text-sm ${status.type === "error" ? "bg-red-500/10 text-red-700 dark:text-red-300" : status.type === "success" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-sky-500/10 text-sky-700 dark:text-sky-300"}`}
          >
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
