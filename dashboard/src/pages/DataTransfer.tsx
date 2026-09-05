import { lazy, Suspense, type KeyboardEvent } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FileKey2,
  LoaderCircle,
  Menu,
} from "lucide-react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useBrowserOnline } from "../hooks/useBrowserOnline";
import { OFFLINE_EXPORT_MESSAGE } from "../lib/network";
import type { DashboardLayoutContext } from "./DashboardLayout";

const BrowserBookmarkImportSection = lazy(
  () => import("../components/BrowserBookmarkImportSection"),
);
const LocalBrowserBookmarkImportSection = lazy(
  () => import("../components/LocalBrowserBookmarkImportSection"),
);
const DataExportSection = lazy(
  () => import("../components/DataExportSection"),
);
const FavLockMigrationImportSection = lazy(
  () => import("../components/FavLockMigrationImportSection"),
);
const LocalVaultRestoreSection = lazy(
  () => import("../components/LocalVaultRestoreSection"),
);

const tabs = [
  { id: "import", label: "Import", icon: ArrowDownToLine },
  { id: "export", label: "Export", icon: ArrowUpFromLine },
  { id: "migrate", label: "Migrate", icon: FileKey2 },
] as const;

type DataTransferTab = (typeof tabs)[number]["id"];

function tabFromHash(hash: string): DataTransferTab {
  if (hash === "#export" || hash === "#export-data") return "export";
  if (hash === "#migrate" || hash === "#migrate-account") return "migrate";
  return "import";
}

export default function DataTransfer() {
  const { setIsMobileSidebarOpen } = useOutletContext<DashboardLayoutContext>();
  const { isLocalAccount } = useAuth();
  const online = useBrowserOnline();
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = tabFromHash(location.hash);

  const selectTab = (tab: DataTransferTab) => {
    navigate({
      pathname: location.pathname,
      search: location.search,
      hash: tab === "import" ? "" : tab,
    });
  };

  const selectTabFromKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: DataTransferTab,
  ) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const currentIndex = tabs.findIndex(({ id }) => id === currentTab);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : event.key === "ArrowRight"
            ? (currentIndex + 1) % tabs.length
            : (currentIndex - 1 + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex].id;
    selectTab(nextTab);
    document.getElementById(`${nextTab}-tab`)?.focus();
  };

  return (
    <div className="w-full min-w-0 flex-1 space-y-6 lg:space-y-8">
      <header className="flex flex-col justify-between gap-4 px-4 pt-4 sm:px-5 md:flex-row md:items-center lg:px-1 lg:pt-1">
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="theme-button-icon -ml-2 inline-flex size-11 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[var(--app-ink)] sm:text-[2rem] sm:leading-tight">
              Data transfer
            </h1>
          </div>
          <p className="mt-1 text-sm text-[var(--app-muted)] sm:text-[0.95rem]">
            Import, export, or migrate your FavLock data
          </p>
        </div>
      </header>

      <section className="px-6 pb-8 lg:px-0">
        <div className="max-w-3xl">
          <div
            role="tablist"
            aria-label="Data transfer sections"
            className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl border bg-[var(--app-highlight)]/50 p-1 backdrop-blur-md liquid-divider"
          >
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                id={`${id}-tab`}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                aria-controls={`${id}-panel`}
                tabIndex={activeTab === id ? 0 : -1}
                onClick={() => selectTab(id)}
                onKeyDown={(event) => selectTabFromKeyboard(event, id)}
                className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  activeTab === id
                    ? "theme-nav-button-active shadow-sm"
                    : "theme-nav-button"
                }`}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 retro-panel rounded-2xl p-6">
            <div
              id={`${activeTab}-panel`}
              role="tabpanel"
              aria-labelledby={`${activeTab}-tab`}
            >
              <Suspense
                fallback={
                  <div
                    className="flex min-h-40 items-center justify-center gap-2 text-sm text-[var(--app-muted)]"
                    role="status"
                  >
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    Loading {activeTab} tools...
                  </div>
                }
              >
                {activeTab === "import" ? (
                  isLocalAccount ? (
                    <LocalBrowserBookmarkImportSection />
                  ) : (
                    <BrowserBookmarkImportSection />
                  )
                ) : activeTab === "export" ? (
                  isLocalAccount || online ? (
                    <DataExportSection />
                  ) : (
                    <div role="status">
                      <h2 className="text-base font-semibold text-[var(--app-ink)]">
                        Export unavailable offline
                      </h2>
                      <p className="mt-1 text-sm text-[var(--app-muted)]">
                        {OFFLINE_EXPORT_MESSAGE}
                      </p>
                    </div>
                  )
                ) : isLocalAccount ? (
                  <LocalVaultRestoreSection />
                ) : (
                  <FavLockMigrationImportSection />
                )}
              </Suspense>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
