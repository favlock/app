import { HeartPulse, LoaderCircle, Menu, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import type { DashboardLayoutContext } from "../pages/DashboardLayout";
import { Button } from "./ui/button";

export default function LibraryHealthProGate({
  children,
}: {
  children: ReactNode;
}) {
  const { setIsMobileSidebarOpen } =
    useOutletContext<DashboardLayoutContext>();
  const { isLocalAccount } = useAuth();
  const { data: accountPlan, isError, isLoading, refetch } = useAccountPlan();

  if (accountPlan?.id === "pro") return <>{children}</>;

  return (
    <div className="w-full min-w-0 flex-1">
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

      <section className="px-4 pb-8 pt-8 sm:px-5 lg:px-0 lg:pt-12">
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
