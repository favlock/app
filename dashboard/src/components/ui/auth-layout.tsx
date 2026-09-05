import type React from "react";
import { AppLogo } from "../AppLogo";
import { WEB_URL } from "../../lib/appUrls";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-layout flex min-h-dvh items-center justify-center px-4 py-8 sm:py-12">

      <div className="auth-panel w-full max-w-md rounded-[1.75rem] border p-6 sm:p-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <a
            href={WEB_URL}
            aria-label="FavLock homepage"
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600"
          >
            <AppLogo className="h-8 w-auto" />
          </a>
          <span className="inline-flex rounded-full border border-[var(--app-lavender-border)] bg-[var(--app-lavender)] px-3 py-1.5 text-xs font-semibold text-[var(--app-ink)]">
            Private by design
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
