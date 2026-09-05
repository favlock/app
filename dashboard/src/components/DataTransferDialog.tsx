import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  FileKey2,
  LoaderCircle,
} from "lucide-react";
import { lazy, Suspense } from "react";
import { useAuth } from "../context/useAuth";
import { useBrowserOnline } from "../hooks/useBrowserOnline";
import { isBrowserOnline, OFFLINE_EXPORT_MESSAGE } from "../lib/network";
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
const LocalBrowserBookmarkImportSection = lazy(
  () => import("./LocalBrowserBookmarkImportSection"),
);
const FavLockMigrationImportSection = lazy(
  () => import("./FavLockMigrationImportSection"),
);
const DataExportSection = lazy(() => import("./DataExportSection"));
const LocalVaultRestoreSection = lazy(
  () => import("./LocalVaultRestoreSection"),
);

export type DataTransferView = "chooser" | "import" | "export" | "migrate";

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
  const online = useBrowserOnline();
  const { isLocalAccount } = useAuth();
  const exportAvailable = isLocalAccount || online;
  return (
    <Dialog open={view !== null} onClose={onClose} size="3xl">
      {view === "chooser" ? (
        <>
          <DialogTitle>Data transfer</DialogTitle>
          <DialogDescription>
            {isLocalAccount
              ? "Create or restore an encrypted backup of the data saved in this browser."
              : "Choose what you want to move into, out of, or between FavLock accounts."}
          </DialogDescription>

          <div className={`mt-6 grid gap-3 ${online || isLocalAccount ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            <button
              type="button"
              onClick={() => onViewChange("import")}
              className="group rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-[color-mix(in_oklab,var(--app-primary)_42%,transparent)] hover:bg-[color-mix(in_oklab,var(--app-primary)_4%,white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)]"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--app-primary)_12%,white)] text-[var(--app-primary)] transition group-hover:bg-[color-mix(in_oklab,var(--app-primary)_18%,white)]">
                <ArrowDownToLine size={19} aria-hidden="true" />
              </span>
              <span className="mt-4 block text-sm font-semibold text-gray-900">
                {isLocalAccount ? "Import bookmarks locally" : "Import bookmarks"}
              </span>
              <span className="mt-1 block text-sm leading-5 text-gray-600">
                {isLocalAccount
                  ? "Import an HTML or Safari ZIP export without using the cloud."
                  : "Add bookmarks from a browser or an HTML file."}
              </span>
            </button>

            {exportAvailable && <button
              type="button"
              onClick={() => {
                if (isLocalAccount || isBrowserOnline()) onViewChange("export");
              }}
              className="group rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-[color-mix(in_oklab,var(--app-primary)_42%,transparent)] hover:bg-[color-mix(in_oklab,var(--app-primary)_4%,white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)]"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--app-primary)_12%,white)] text-[var(--app-primary)] transition group-hover:bg-[color-mix(in_oklab,var(--app-primary)_18%,white)]">
                <ArrowUpFromLine size={19} aria-hidden="true" />
              </span>
              <span className="mt-4 block text-sm font-semibold text-gray-900">
                {isLocalAccount ? "Back up local vault" : "Export data"}
              </span>
              <span className="mt-1 block text-sm leading-5 text-gray-600">
                {isLocalAccount
                  ? "Download an encrypted .favlock backup or browser bookmark file."
                  : "Download a FavLock archive or browser-compatible bookmark file."}
              </span>
            </button>}

            <button
              type="button"
              onClick={() => onViewChange("migrate")}
              className="group rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-[color-mix(in_oklab,var(--app-primary)_42%,transparent)] hover:bg-[color-mix(in_oklab,var(--app-primary)_4%,white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)]"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--app-primary)_12%,white)] text-[var(--app-primary)] transition group-hover:bg-[color-mix(in_oklab,var(--app-primary)_18%,white)]">
                <FileKey2 size={19} aria-hidden="true" />
              </span>
              <span className="mt-4 block text-sm font-semibold text-gray-900">
                {isLocalAccount ? "Restore local backup" : "Migrate account"}
              </span>
              <span className="mt-1 block text-sm leading-5 text-gray-600">
                {isLocalAccount
                  ? "Restore an encrypted backup into this empty local vault."
                  : "Move an encrypted library into a new, empty account."}
              </span>
            </button>
          </div>

          {!isLocalAccount && !online && <p role="status" className="mt-4 text-sm text-gray-600">{OFFLINE_EXPORT_MESSAGE}</p>}
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

          {view === "export" && !exportAvailable ? (
            <>
              <DialogTitle>Export unavailable offline</DialogTitle>
              <DialogDescription>{OFFLINE_EXPORT_MESSAGE}</DialogDescription>
            </>
          ) : <Suspense
            fallback={
              <div
                className="flex min-h-40 items-center justify-center gap-2 text-sm text-gray-600"
                role="status"
              >
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Loading {view === "migrate" ? "migration" : view} tools...
              </div>
            }
          >
            {view === "import" ? (
              <>
                <DialogTitle className="sr-only">
                  {isLocalAccount ? "Import bookmarks locally" : "Import bookmarks"}
                </DialogTitle>
                {isLocalAccount ? (
                  <LocalBrowserBookmarkImportSection />
                ) : (
                  <BrowserBookmarkImportSection />
                )}
              </>
            ) : view === "migrate" ? (
              <>
                <DialogTitle className="sr-only">
                  {isLocalAccount ? "Restore local backup" : "Migrate account"}
                </DialogTitle>
                {isLocalAccount ? (
                  <LocalVaultRestoreSection />
                ) : (
                  <FavLockMigrationImportSection />
                )}
              </>
            ) : (
              <>
                <DialogTitle className="sr-only">Export data</DialogTitle>
                <DataExportSection />
              </>
            )}
          </Suspense>}

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
