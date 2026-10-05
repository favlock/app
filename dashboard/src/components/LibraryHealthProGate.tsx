import { HeartPulse, LoaderCircle, Menu, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { useSharedDuplicatePreview } from "../context/useSharedDuplicatePreview";
import type { DuplicatePreview } from "../hooks/useDuplicatePreview";
import type { BookmarkDuplicateGroup } from "../lib/bookmarkDuplicates";
import type { DashboardLayoutContext } from "../pages/DashboardLayout";
import LibraryHealthTabs from "./LibraryHealthTabs";
import { Button } from "./ui/button";

export type LibraryHealthFeature = "duplicates" | "broken-links";

const PREVIEW_GROUP_LIMIT = 3;

function pluralize(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function groupHostname(group: BookmarkDuplicateGroup): string {
  try {
    return new URL(group.normalizedUrl).hostname;
  } catch {
    return group.normalizedUrl;
  }
}

function DuplicatePreviewGroups({
  groups,
}: {
  groups: BookmarkDuplicateGroup[];
}) {
  const visibleGroups = groups.slice(0, PREVIEW_GROUP_LIMIT);
  const hiddenGroupCount = groups.length - visibleGroups.length;

  return (
    <div className="mt-5 w-full text-left">
      <ul
        aria-label="Duplicate bookmark examples"
        className="divide-y divide-[color-mix(in_oklab,var(--app-line)_10%,transparent)] rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[var(--app-reading)]"
      >
        {visibleGroups.map((group) => {
          const hostname = groupHostname(group);
          return (
            <li
              key={group.normalizedUrl}
              className="flex min-w-0 items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--app-ink)]">
                  {group.keeper.title || hostname}
                </p>
                <p className="truncate text-xs text-[var(--app-muted)]">
                  {hostname}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-amber-500/12 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                {pluralize(group.duplicates.length + 1, "copy", "copies")}
              </span>
            </li>
          );
        })}
      </ul>
      {hiddenGroupCount > 0 ? (
        <p className="mt-2 text-center text-xs text-[var(--app-muted)]">
          and {pluralize(hiddenGroupCount, "more page", "more pages")} with
          duplicates
        </p>
      ) : null}
    </div>
  );
}

function DuplicatesUpgradeContent({
  isLocalAccount,
  preview,
}: {
  isLocalAccount: boolean;
  preview: DuplicatePreview;
}) {
  const upgradeSentence = isLocalAccount
    ? "Connect a Pro cloud account to merge them in one step and catch new duplicates with a daily scan."
    : "Upgrade to Pro to merge them in one step, keeping tags and favorites, and catch new duplicates with a daily scan.";

  if (preview.status === "ready" && preview.duplicateCount > 0) {
    return (
      <>
        <h2 className="mt-4 text-lg font-semibold text-[var(--app-ink)]">
          {pluralize(
            preview.duplicateCount,
            "duplicate bookmark",
            "duplicate bookmarks",
          )}{" "}
          in your library
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-[var(--app-muted)]">
          Found across{" "}
          {pluralize(preview.groups.length, "page", "pages")} in{" "}
          {pluralize(preview.scannedCount, "bookmark", "bookmarks")} on this
          device. {upgradeSentence}
        </p>
        <DuplicatePreviewGroups groups={preview.groups} />
      </>
    );
  }

  if (preview.status === "ready" && preview.scannedCount > 0) {
    return (
      <>
        <h2 className="mt-4 text-lg font-semibold text-[var(--app-ink)]">
          No duplicates right now
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-[var(--app-muted)]">
          We checked{" "}
          {pluralize(preview.scannedCount, "bookmark", "bookmarks")} on this
          device. Pro keeps checking daily and flags new duplicates as your
          library grows.
        </p>
      </>
    );
  }

  return (
    <>
      <h2 className="mt-4 text-lg font-semibold text-[var(--app-ink)]">
        {isLocalAccount
          ? "Library health requires a Pro cloud account"
          : "Library health is included with Pro"}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-[var(--app-muted)]">
        {isLocalAccount
          ? "Connect this local vault to a cloud account, then upgrade to scan for duplicate and broken links."
          : "Find duplicate bookmarks and check for broken links with scans that resume safely on this device."}
      </p>
      {preview.status === "loading" ? (
        <p
          className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--app-muted)]"
          role="status"
        >
          <LoaderCircle
            className="size-4 animate-spin text-[var(--app-primary)]"
            aria-hidden="true"
          />
          Checking your library for duplicates…
        </p>
      ) : null}
    </>
  );
}

function BrokenLinksUpgradeContent({
  isLocalAccount,
}: {
  isLocalAccount: boolean;
}) {
  return (
    <>
      <h2 className="mt-4 text-lg font-semibold text-[var(--app-ink)]">
        {isLocalAccount
          ? "Broken-link checks require a Pro cloud account"
          : "Catch broken links before you need them"}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-[var(--app-muted)]">
        Pro checks your saved links on a schedule and flags pages that are
        broken, redirected, or restricted, so you can move dead bookmarks to
        Trash in one step.
      </p>
      <p className="mt-3 max-w-md text-xs leading-5 text-[var(--app-muted)]">
        URLs are decrypted on this device and sent temporarily to FavLock’s API
        for checking. They are not saved by the service.
      </p>
    </>
  );
}

export default function LibraryHealthProGate({
  children,
  feature,
}: {
  children: ReactNode;
  feature: LibraryHealthFeature;
}) {
  const { setIsMobileSidebarOpen } =
    useOutletContext<DashboardLayoutContext>();
  const { isLocalAccount } = useAuth();
  const { data: accountPlan, isError, isLoading, refetch } = useAccountPlan();
  const showsUpgrade = Boolean(
    accountPlan && accountPlan.id !== "pro" && !isLoading && !isError,
  );
  const duplicatePreview = useSharedDuplicatePreview();

  if (accountPlan?.id === "pro") return <>{children}</>;

  return (
    <div className="w-full min-w-0 flex-1 space-y-5 lg:space-y-6">
      <header className="px-4 pt-4 sm:px-5 lg:px-1 lg:pt-1">
        <div className="flex min-w-0 items-center gap-2.5 py-1 sm:py-2">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            className="theme-button-icon -ml-2 inline-flex size-11 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-[-0.025em] text-[var(--app-ink)] sm:text-[2rem] sm:leading-tight">
              Library health
            </h1>
            <p className="mt-1 text-sm text-[var(--app-muted)] sm:text-[0.95rem]">
              Keep your saved library tidy and reliable
            </p>
          </div>
        </div>
      </header>

      {showsUpgrade ? <LibraryHealthTabs activeTab={feature} /> : null}

      <section className="px-4 pb-8 sm:px-5 lg:px-0">
        <div className="mx-auto flex min-h-72 max-w-xl flex-col items-center justify-center rounded-3xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[var(--app-card)] px-6 py-10 text-center shadow-sm">
          {isLoading ? (
            <>
              <LoaderCircle
                className="size-6 animate-spin text-[var(--app-primary)]"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-medium text-[var(--app-muted)]" role="status">
                Checking your plan…
              </p>
            </>
          ) : isError || !accountPlan ? (
            <>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--app-rose)] text-red-600 dark:text-red-300">
                <HeartPulse className="size-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-base font-semibold text-[var(--app-ink)]">
                Couldn’t verify your plan
              </h2>
              <p className="mt-1 max-w-md text-sm leading-6 text-[var(--app-muted)]">
                Try again before opening Library health.
              </p>
              <Button type="button" outline className="mt-5" onClick={() => void refetch()}>
                Try again
              </Button>
            </>
          ) : (
            <>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--app-lavender)] text-[var(--app-primary)]">
                <HeartPulse className="size-5" aria-hidden="true" />
              </span>
              {feature === "duplicates" ? (
                <DuplicatesUpgradeContent
                  isLocalAccount={isLocalAccount}
                  preview={duplicatePreview}
                />
              ) : (
                <BrokenLinksUpgradeContent isLocalAccount={isLocalAccount} />
              )}
              <Button
                href={isLocalAccount
                  ? "/login?mode=sign-in&reconnect=1&merge=1"
                  : "/checkout"}
                color="emerald"
                className="mt-5"
              >
                <Sparkles data-slot="icon" aria-hidden="true" />
                {isLocalAccount ? "Use a cloud account" : "Upgrade to Pro"}
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
