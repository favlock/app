import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  Globe2,
  LoaderCircle,
} from "lucide-react";
import { useEncryption } from "../context/useEncryption";
import { useAuth } from "../context/useAuth";
import { useFolders } from "../hooks/useFoldersQuery";
import { useNotes } from "../hooks/useNotesQuery";
import { useReadspace } from "../hooks/useReadspaceQuery";
import { useTags } from "../hooks/useTagsQuery";
import { useTodos } from "../hooks/useTodosQuery";
import {
  buildBrowserBookmarksHtml,
  buildFavLockExport,
  type ExportCategory,
  type ExportSelection,
} from "../lib/dataExport";
import { loadAllBookmarksForExport } from "../lib/bookmarkExportRepository";
import { Button } from "./ui/button";
import { Checkbox, CheckboxField } from "./ui/checkbox";
import { Description, Label } from "./ui/fieldset";
import { Text } from "./ui/text";

type ExportFormat = "json" | "html";

const CATEGORY_DETAILS: Array<{
  id: ExportCategory;
  label: string;
  description: string;
}> = [
  {
    id: "bookmarks",
    label: "Bookmarks",
    description: "Titles, URLs, favorites, collections, and tags",
  },
  {
    id: "notes",
    label: "Notes",
    description: "Titles, note content, collections, and tags",
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
];

const INITIAL_SELECTION: ExportSelection = {
  bookmarks: true,
  notes: true,
  todos: true,
  readspace: true,
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
  const { user } = useAuth();
  const { cryptoKey, keyLoading, triggerUnlock } = useEncryption();
  const [format, setFormat] = useState<ExportFormat>("json");
  const [selection, setSelection] =
    useState<ExportSelection>(INITIAL_SELECTION);
  const [exported, setExported] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const foldersQuery = useFolders();
  const tagsQuery = useTags();
  const notesQuery = useNotes({ enabled: format === "json" });
  const todosQuery = useTodos({ enabled: format === "json" });
  const readspaceQuery = useReadspace(format === "json");

  const relevantQueries = useMemo(
    () =>
      format === "json"
        ? [
            foldersQuery,
            tagsQuery,
            notesQuery,
            todosQuery,
            readspaceQuery,
          ]
        : [foldersQuery],
    [
      foldersQuery,
      format,
      notesQuery,
      readspaceQuery,
      tagsQuery,
      todosQuery,
    ],
  );
  const isLoading = relevantQueries.some(
    (query) => query.isLoading || query.isFetching,
  );
  const hasError = relevantQueries.some((query) => query.isError);
  const hasSelection = Object.values(selection).some(Boolean);

  const setCategory = (category: ExportCategory, checked: boolean) => {
    setSelection((current) => ({ ...current, [category]: checked }));
    setExported(false);
  };

  const handleExport = async () => {
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
          ? await loadAllBookmarksForExport(user?.id ?? "")
          : [];
      const date = new Date().toISOString().slice(0, 10);
      if (format === "html") {
        downloadFile(
          buildBrowserBookmarksHtml(bookmarks, foldersQuery.data ?? []),
          `favlock-bookmarks-${date}.html`,
          "text/html;charset=utf-8",
        );
      } else {
        const archive = buildFavLockExport(
          {
            bookmarks,
            folders: foldersQuery.data ?? [],
            tags: tagsQuery.data ?? [],
            notes: notesQuery.data ?? [],
            todos: todosQuery.data ?? [],
            readspace: readspaceQuery.data ?? [],
          },
          selection,
        );
        downloadFile(
          `${JSON.stringify(archive, null, 2)}\n`,
          `favlock-export-${date}.json`,
          "application/json;charset=utf-8",
        );
      }
      setExported(true);
    } catch {
      setExportError(
        "FavLock could not prepare the export. Please try again.",
      );
    } finally {
      setIsPreparing(false);
    }
  };

  const exportDisabled =
    keyLoading ||
    isLoading ||
    isPreparing ||
    hasError ||
    (format === "json" && !hasSelection);

  return (
    <section>
      <div>
        <h3 className="text-base font-semibold text-gray-900">Export data</h3>
        <Text className="mt-1 text-sm text-gray-600">
          Download a portable copy of your FavLock data. The export is created
          locally in this browser.
        </Text>
      </div>

      <div
        className="mt-5 flex gap-3 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-amber-950"
        role="note"
      >
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">This export is not encrypted</p>
          <p className="mt-0.5 text-sm text-amber-900/80">
            Anyone with the downloaded file can read its contents. Store it in
            a safe place.
          </p>
        </div>
      </div>

      <fieldset className="mt-6">
        <legend className="text-sm font-semibold text-gray-900">
          Export format
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            aria-pressed={format === "json"}
            onClick={() => {
              setFormat("json");
              setExported(false);
            }}
            className={`rounded-xl border p-4 text-left transition-colors ${
              format === "json"
                ? "border-[var(--app-primary)] bg-[color-mix(in_oklab,var(--app-primary)_8%,white)] ring-1 ring-[var(--app-primary)]"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <FileJson className="size-5 text-[var(--app-primary)]" />
            <span className="mt-2 block text-sm font-semibold text-gray-900">
              FavLock JSON
            </span>
            <span className="mt-1 block text-xs leading-5 text-gray-600">
              Complete archive with selectable content
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

      {format === "json" ? (
        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-gray-900">
            What to export
          </legend>
          <p className="mt-1 text-xs text-gray-500">
            Collection and tag details are included to preserve organization.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {CATEGORY_DETAILS.map((category) => (
              <CheckboxField key={category.id}>
                <Checkbox
                  color="emerald"
                  checked={selection[category.id]}
                  onChange={(checked) => setCategory(category.id, checked)}
                />
                <Label>{category.label}</Label>
                <Description>{category.description}</Description>
              </CheckboxField>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-900">Bookmarks only</p>
          <p className="mt-1 text-sm text-gray-600">
            Nested collections and bookmark tags will be preserved where the
            destination browser supports them.
          </p>
        </div>
      )}

      {hasError || exportError ? (
        <p className="mt-5 text-sm text-red-600" role="alert">
          {exportError ??
            "FavLock could not load all of your data. Please close this window and try again."}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {exported ? (
          <span
            className="mr-auto inline-flex items-center gap-2 text-sm text-emerald-700"
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
              : "Download export"}
        </Button>
      </div>
    </section>
  );
}
