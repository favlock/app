import type React from "react";
import { AppLogo } from "../AppLogo";
import { WEB_URL } from "../../lib/appUrls";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(245,158,11,0.16),transparent_34%),radial-gradient(circle_at_82%_8%,rgba(15,118,110,0.12),transparent_30%),linear-gradient(180deg,#fff8e7_0%,#f7f1df_100%)]" />
      <div className="w-full max-w-md rounded-[1.5rem] border border-[#1d2230]/10 bg-[#fff8e9]/90 p-7 shadow-[0_28px_70px_-36px_rgba(29,34,48,0.42),0_1px_2px_rgba(29,34,48,0.06)] backdrop-blur-xl sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <a
            href={WEB_URL}
            aria-label="FavLock homepage"
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600"
          >
            <AppLogo className="h-8 w-auto" />
          </a>
          <span className="inline-flex rounded-full border border-amber-700/20 bg-amber-400/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-amber-800">
            Private by design
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
