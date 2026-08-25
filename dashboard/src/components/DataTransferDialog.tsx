import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  LoaderCircle,
} from "lucide-react";
import { lazy, Suspense } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

const BrowserBookmarkImportSection = lazy(
  () => import("./BrowserBookmarkImportSection"),
);
const DataExportSection = lazy(() => import("./DataExportSection"));

export type DataTransferView = "chooser" | "import" | "export";

interface DataTransferDialogProps {
  view: DataTransferView | null;
  onViewChange: (view: DataTransferView) => void;
  onClose: () => void;
}

export default function DataTransferDialog({
  view,
  onViewChange,
  onClose,
}: DataTransferDialogProps) {
  const size = view === "import" ? "3xl" : view === "export" ? "2xl" : "lg";

  return (
    <Dialog open={view !== null} onClose={onClose} size={size}>
      {view === "chooser" ? (
        <>
          <DialogTitle>Import or export</DialogTitle>
          <DialogDescription>
            Bring bookmarks into FavLock or download a portable copy of your
            data.
          </DialogDescription>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onViewChange("import")}
              className="group rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-[color-mix(in_oklab,var(--app-primary)_42%,transparent)] hover:bg-[color-mix(in_oklab,var(--app-primary)_4%,white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)]"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--app-primary)_12%,white)] text-[var(--app-primary)] transition group-hover:bg-[color-mix(in_oklab,var(--app-primary)_18%,white)]">
                <ArrowDownToLine size={19} aria-hidden="true" />
              </span>
              <span className="mt-4 block text-sm font-semibold text-gray-900">
                Import bookmarks
              </span>
              <span className="mt-1 block text-sm leading-5 text-gray-600">
                Add bookmarks from Chrome, Safari, Edge, or Firefox while
                preserving their folder structure.
              </span>
            </button>

            <button
              type="button"
              onClick={() => onViewChange("export")}
              className="group rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-[color-mix(in_oklab,var(--app-primary)_42%,transparent)] hover:bg-[color-mix(in_oklab,var(--app-primary)_4%,white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)]"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--app-primary)_12%,white)] text-[var(--app-primary)] transition group-hover:bg-[color-mix(in_oklab,var(--app-primary)_18%,white)]">
                <ArrowUpFromLine size={19} aria-hidden="true" />
              </span>
              <span className="mt-4 block text-sm font-semibold text-gray-900">
                Export data
              </span>
              <span className="mt-1 block text-sm leading-5 text-gray-600">
                Download a FavLock archive or browser-compatible bookmark file.
              </span>
            </button>
          </div>

          <DialogActions>
            <Button type="button" outline onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </>
      ) : view ? (
        <>
          <div className="mb-5">
            <Button
              type="button"
              plain
              onClick={() => onViewChange("chooser")}
              className="-ml-3"
            >
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
          </div>

          <Suspense
            fallback={
              <div
                className="flex min-h-40 items-center justify-center gap-2 text-sm text-gray-600"
                role="status"
              >
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Loading {view === "import" ? "import" : "export"} tools...
              </div>
            }
          >
            {view === "import" ? (
              <>
                <DialogTitle className="sr-only">Import bookmarks</DialogTitle>
                <BrowserBookmarkImportSection />
              </>
            ) : (
              <>
                <DialogTitle className="sr-only">Export data</DialogTitle>
                <DataExportSection />
              </>
            )}
          </Suspense>

          <DialogActions>
            <Button type="button" outline onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </>
      ) : null}
    </Dialog>
  );
}
