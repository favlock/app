import { AlertTriangle, Download, FileCode2, FileJson2, FileText } from "lucide-react";
import { useState } from "react";
import type { WebHighlight } from "../hooks/useHighlightsQuery";
import {
  serializeHighlightsExport,
  type HighlightExportArticle,
  type HighlightExportFormat,
} from "../lib/highlightExport";
import type { Bookmark } from "../types/bookmark";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

const formats: Array<{
  id: HighlightExportFormat;
  label: string;
  description: string;
  extension: string;
  mimeType: string;
  icon: typeof FileText;
}> = [
  {
    id: "markdown",
    label: "Markdown",
    description: "Best for notes apps and writing tools",
    extension: "md",
    mimeType: "text/markdown;charset=utf-8",
    icon: FileText,
  },
  {
    id: "html",
    label: "HTML",
    description: "A styled document that opens in any browser",
    extension: "html",
    mimeType: "text/html;charset=utf-8",
    icon: FileCode2,
  },
  {
    id: "json",
    label: "JSON",
    description: "Structured data for tools and integrations",
    extension: "json",
    mimeType: "application/json;charset=utf-8",
    icon: FileJson2,
  },
];

function download(contents: string, extension: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `favlock-highlights-${new Date().toISOString().slice(0, 10)}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function HighlightExportDialog({
  highlights,
  bookmarks,
  articles,
  scopeLabel,
  onClose,
}: {
  highlights: WebHighlight[];
  bookmarks: Bookmark[];
  articles?: HighlightExportArticle[];
  scopeLabel: string;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<HighlightExportFormat>("markdown");
  const open = highlights.length > 0;

  const handleDownload = () => {
    const selectedFormat = formats.find((item) => item.id === format)!;
    download(
      articles
        ? serializeHighlightsExport(format, highlights, bookmarks, new Date(), articles)
        : serializeHighlightsExport(format, highlights, bookmarks),
      selectedFormat.extension,
      selectedFormat.mimeType,
    );
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>Export highlights</DialogTitle>
      <DialogDescription>
        {scopeLabel} · {highlights.length.toLocaleString()} {highlights.length === 1 ? "highlight" : "highlights"}
      </DialogDescription>

      <fieldset className="mt-6">
        <legend className="text-sm font-semibold text-gray-900">Format</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {formats.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={format === item.id}
                onClick={() => setFormat(item.id)}
                className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)] ${
                  format === item.id
                    ? "border-[var(--app-primary)] bg-[color-mix(in_oklab,var(--app-primary)_8%,white)] ring-1 ring-[var(--app-primary)]"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <Icon className="size-5 text-[var(--app-primary)]" aria-hidden="true" />
                <span className="mt-2 block text-sm font-semibold text-gray-900">{item.label}</span>
                <span className="mt-1 block text-xs leading-5 text-gray-600">{item.description}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 flex gap-3 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-amber-950" role="note">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">Readable export</p>
          <p className="mt-0.5 text-sm text-amber-900/80">
            Quotes, source links, and annotations in this download are not encrypted.
          </p>
        </div>
      </div>

      <DialogActions>
        <Button type="button" plain onClick={onClose}>Cancel</Button>
        <Button type="button" color="emerald" onClick={handleDownload}>
          <Download className="size-4" aria-hidden="true" />
          Download {formats.find((item) => item.id === format)?.label}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
