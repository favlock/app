import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Globe2,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { useEncryption } from "../context/useEncryption";
import { useAuth } from "../context/useAuth";
import { useFolders } from "../hooks/useFoldersQuery";
import { useLists } from "../hooks/useListsQuery";
import { useNotes } from "../hooks/useNotesQuery";
import { useReadspace } from "../hooks/useReadspaceQuery";
import { useTags } from "../hooks/useTagsQuery";
import { useTodos } from "../hooks/useTodosQuery";
import { useHighlights } from "../hooks/useHighlightsQuery";
import { useBrowserOnline } from "../hooks/useBrowserOnline";
import { isBrowserOnline, OFFLINE_EXPORT_MESSAGE } from "../lib/network";
import {
  buildBrowserBookmarksHtml,
  buildFavLockExport,
  type ExportCategory,
  type ExportSelection,
} from "../lib/dataExport";
import {
  encryptFavLockArchive,
  serializeEncryptedFavLockArchive,
} from "../lib/encryptedArchive";
import {
  OFFLINE_DECRYPTOR_FILENAME,
  buildOfflineDecryptorHtml,
} from "../lib/offlineDecryptor";
import { loadAllBookmarksForExport } from "../lib/bookmarkExportRepository";
import { Button } from "./ui/button";
import { Checkbox, CheckboxField } from "./ui/checkbox";
import { Description, Label } from "./ui/fieldset";
import {
  DataTransferActionBar,
  DataTransferSectionHeader,
} from "./DataTransferControls";

type ExportFormat = "encrypted" | "html";

const CATEGORY_DETAILS: Array<{
  id: ExportCategory;
  label: string;
  description: string;
}> = [
  {
    id: "bookmarks",
    label: "Bookmarks",
    description: "Titles, URLs, favorites, collections, tags, and Lists",
  },
  {
    id: "notes",
    label: "Documents",
    description: "Titles, document content, collections, and tags",
  },
  {
    id: "todos",
    label: "Tasks",
    description: "Task content, completion state, collections, and tags",
  },
  {
    id: "readspace",
    label: "Readspace",
    description: "Saved reading content, collections, and tags",
  },
  {
    id: "highlights",
    label: "Highlights",
    description: "Quotes, annotations, colors, and their saved page or article source",
  },
];

const INITIAL_SELECTION: ExportSelection = {
  bookmarks: true,
  notes: true,
  todos: true,
  readspace: true,
  highlights: true,
};

function downloadFile(contents: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function DataExportSection() {
  const online = useBrowserOnline();
  const { user, isLocalAccount } = useAuth();
  const { cryptoKey, keyLoading, triggerUnlock } = useEncryption();
  const [format, setFormat] = useState<ExportFormat>("encrypted");
  const [selection, setSelection] =
    useState<ExportSelection>(INITIAL_SELECTION);
  const [exported, setExported] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const foldersQuery = useFolders();
  const tagsQuery = useTags();
  const listsQuery = useLists({
    enabled: format === "encrypted" && selection.bookmarks,
  });
  const notesQuery = useNotes({ enabled: format === "encrypted" && selection.notes });
  const todosQuery = useTodos({ enabled: format === "encrypted" && selection.todos });
  const readspaceQuery = useReadspace(format === "encrypted" && selection.readspace);
  const highlightsQuery = useHighlights(
    format === "encrypted" && selection.highlights && !isLocalAccount,
  );
  const effectiveSelection = isLocalAccount
    ? { ...selection, readspace: false, highlights: false }
    : selection;

  const relevantQueries = useMemo(
    () =>
      format === "encrypted"
        ? [
            foldersQuery,
            tagsQuery,
            ...(selection.bookmarks ? [listsQuery] : []),
            ...(selection.notes ? [notesQuery] : []),
            ...(selection.todos ? [todosQuery] : []),
            ...(selection.readspace && !isLocalAccount ? [readspaceQuery] : []),
            ...(selection.highlights && !isLocalAccount ? [highlightsQuery] : []),
          ]
        : [foldersQuery],
    [
      foldersQuery,
      format,
      listsQuery,
      notesQuery,
      readspaceQuery,
      highlightsQuery,
      selection.bookmarks,
      selection.notes,
      selection.readspace,
      selection.todos,
      selection.highlights,
      isLocalAccount,
      tagsQuery,
      todosQuery,
    ],
  );
  const isLoading = relevantQueries.some(
    (query) => query.isLoading || query.isFetching,
  );
  const hasError = relevantQueries.some((query) => query.isError);
  const hasSelection = Object.values(effectiveSelection).some(Boolean);

  const setCategory = (category: ExportCategory, checked: boolean) => {
    setSelection((current) => ({
      ...current,
      [category]: checked,
      ...(category === "bookmarks" && !checked ? { highlights: false } : {}),
      ...(category === "readspace" && !checked ? { highlights: false } : {}),
      ...(category === "highlights" && checked
        ? { bookmarks: true, readspace: true }
        : {}),
    }));
    setExported(false);
  };

  const handleExport = async () => {
    if (!isLocalAccount && !isBrowserOnline()) return;
    if (!cryptoKey) {
      triggerUnlock();
      return;
    }

    setIsPreparing(true);
    setExportError(null);
    setExported(false);
    try {
      const bookmarks =
        format === "html" || selection.bookmarks
          ? await loadAllBookmarksForExport(
              user?.id ?? "",
              isLocalAccount ? cryptoKey : undefined,
            )
          : [];
      const date = new Date().toISOString().slice(0, 10);
      if (!isLocalAccount && !isBrowserOnline()) throw new Error(OFFLINE_EXPORT_MESSAGE);
      if (format === "html") {
        downloadFile(
          buildBrowserBookmarksHtml(
            bookmarks.filter((bookmark) => !bookmark.is_highlight_source),
            foldersQuery.data ?? [],
          ),
          `favlock-bookmarks-${date}.html`,
          "text/html;charset=utf-8",
        );
      } else {
        const archive = buildFavLockExport(
          {
            bookmarks,
            lists: listsQuery.data ?? [],
            folders: foldersQuery.data ?? [],
            tags: tagsQuery.data ?? [],
            notes: notesQuery.data ?? [],
            todos: todosQuery.data ?? [],
            readspace: isLocalAccount ? [] : readspaceQuery.data ?? [],
            highlights: highlightsQuery.data ?? [],
          },
          effectiveSelection,
        );
        const encryptedArchive = await encryptFavLockArchive(archive, cryptoKey);
        if (!isLocalAccount && !isBrowserOnline()) throw new Error(OFFLINE_EXPORT_MESSAGE);
        downloadFile(
          serializeEncryptedFavLockArchive(encryptedArchive),
          `favlock-export-${date}.favlock`,
          "application/vnd.favlock.encrypted+json;charset=utf-8",
        );
      }
      setExported(true);
    } catch {
      setExportError(isLocalAccount || isBrowserOnline()
        ? "FavLock could not prepare the export. Please try again."
        : OFFLINE_EXPORT_MESSAGE);
    } finally {
      setIsPreparing(false);
    }
  };

  const exportDisabled =
    keyLoading ||
    isLoading ||
    isPreparing ||
    hasError ||
    (format === "encrypted" && !hasSelection);

  const downloadOfflineDecryptor = () => {
    if (!isLocalAccount && !isBrowserOnline()) return;
    downloadFile(
      buildOfflineDecryptorHtml(),
      OFFLINE_DECRYPTOR_FILENAME,
      "text/html;charset=utf-8",
    );
  };

  if (!isLocalAccount && !online) {
    return <p role="status" className="text-sm text-gray-600">{OFFLINE_EXPORT_MESSAGE}</p>;
  }

  return (
    <section aria-labelledby="favlock-export-heading">
      <DataTransferSectionHeader
        id="favlock-export-heading"
        title="Export data"
        description="Download a portable copy of your FavLock data. The export is created locally in this browser."
      />
      {isLocalAccount && <p role="note" className="mt-4 text-sm text-amber-800">This backup contains the bookmarks, Lists, Documents, Tasks, Collections, and Tags saved in this browser. Keep it with your recovery key; FavLock cannot recover either one for you.</p>}

      <fieldset className="mt-6">
        <legend className="text-sm font-semibold text-gray-900">
          Export format
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            aria-pressed={format === "encrypted"}
            onClick={() => {
              setFormat("encrypted");
              setExported(false);
            }}
            className={`rounded-xl border p-4 text-left transition-colors ${
              format === "encrypted"
                ? "border-[var(--app-primary)] bg-[color-mix(in_oklab,var(--app-primary)_8%,white)] ring-1 ring-[var(--app-primary)]"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <KeyRound className="size-5 text-[var(--app-primary)]" />
            <span className="mt-2 block text-sm font-semibold text-gray-900">
              Encrypted FavLock archive
            </span>
            <span className="mt-1 block text-xs leading-5 text-gray-600">
              Protected by your existing FavLock recovery key
            </span>
          </button>
          <button
            type="button"
            aria-pressed={format === "html"}
            onClick={() => {
              setFormat("html");
              setExported(false);
            }}
            className={`rounded-xl border p-4 text-left transition-colors ${
              format === "html"
                ? "border-[var(--app-primary)] bg-[color-mix(in_oklab,var(--app-primary)_8%,white)] ring-1 ring-[var(--app-primary)]"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <Globe2 className="size-5 text-[var(--app-primary)]" />
            <span className="mt-2 block text-sm font-semibold text-gray-900">
              Browser HTML
            </span>
            <span className="mt-1 block text-xs leading-5 text-gray-600">
              Bookmarks for Chrome, Safari, Firefox, and Edge
            </span>
          </button>
        </div>
      </fieldset>

      {format === "encrypted" ? (
        <>
          <div
            className="mt-5 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-950"
            role="note"
          >
            <ShieldCheck
              className="mt-0.5 size-5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold">Encrypted before download</p>
              <p className="mt-0.5 text-sm text-emerald-900/80">
                This archive uses the same recovery key as your FavLock account.
                The key and readable data stay in this browser.
              </p>
            </div>
          </div>

          {!isLocalAccount && <fieldset className="mt-6">
            <legend className="text-sm font-semibold text-gray-900">
              What to export
            </legend>
            <p className="mt-1 text-xs text-gray-500">
              Collection, tag, and List details are included to preserve organization.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {CATEGORY_DETAILS.map((category) => (
                <CheckboxField key={category.id}>
                  <Checkbox
                    color="emerald"
                    checked={!!selection[category.id]}
                    onChange={(checked) => setCategory(category.id, checked)}
                  />
                  <Label>{category.label}</Label>
                  <Description>{category.description}</Description>
                </CheckboxField>
              ))}
            </div>
          </fieldset>}

          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">
              Need to read the archive without FavLock?
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Download the self-contained decryptor and keep it with your
              backup. It works locally and contains no network code.
            </p>
            <DataTransferActionBar className="mt-3">
              <Button
                type="button"
                outline
                onClick={downloadOfflineDecryptor}
              >
                <Download className="size-4" aria-hidden="true" />
                Download offline decryptor
              </Button>
            </DataTransferActionBar>
          </div>
        </>
      ) : (
        <>
          <div
            className="mt-5 flex gap-3 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-amber-950"
            role="note"
          >
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">
                Browser HTML is not encrypted
              </p>
              <p className="mt-0.5 text-sm text-amber-900/80">
                Anyone with the downloaded file can read its bookmarks.
              </p>
            </div>
          </div>
          <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">Bookmarks only</p>
            <p className="mt-1 text-sm text-gray-600">
              Nested collections and bookmark tags will be preserved where the
              destination browser supports them.
            </p>
          </div>
        </>
      )}

      {hasError || exportError ? (
        <p className="mt-5 text-sm text-red-600" role="alert">
          {exportError ??
            "FavLock could not load all of your data. Please close this window and try again."}
        </p>
      ) : null}

      <DataTransferActionBar>
        {exported ? (
          <span
            className="inline-flex items-center gap-2 text-sm text-emerald-700 sm:mr-auto"
            role="status"
          >
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Export downloaded
          </span>
        ) : null}
        <Button
          type="button"
          color="emerald"
          disabled={exportDisabled}
          onClick={handleExport}
        >
          {isLoading || keyLoading || isPreparing ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {!cryptoKey
            ? "Unlock to export"
            : isPreparing
              ? "Preparing export..."
              : format === "encrypted"
                ? "Download encrypted archive"
                : "Download bookmark HTML"}
        </Button>
      </DataTransferActionBar>
    </section>
  );
}
