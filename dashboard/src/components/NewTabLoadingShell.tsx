import SearchCommandBar from "./SearchCommandBar";

export default function NewTabLoadingShell() {
  return (
    <div className="min-h-screen px-0 pb-10 pt-0 lg:px-4 lg:pt-4">
      <div className="mx-auto flex min-h-screen max-w-[112rem] flex-col gap-0 lg:flex-row lg:items-start lg:gap-4">
        <aside
          className="hidden h-80 w-64 flex-none animate-pulse rounded-xl border border-[#1d2230]/10 bg-white/38 lg:block"
          aria-hidden="true"
        />
        <main className="w-full min-w-0 flex-1 space-y-4">
          <SearchCommandBar />
          <div
            className="mx-3 h-28 animate-pulse rounded-xl border border-[#1d2230]/10 bg-white/38 lg:mx-0"
            aria-hidden="true"
          />
          <p className="sr-only" role="status" aria-live="polite">
            Loading bookmarks and collections
          </p>
        </main>
      </div>
    </div>
  );
}
