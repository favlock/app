import { Component, useId, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { useBrowserOnline } from "../hooks/useBrowserOnline";
import { PageLoadError } from "../lib/pageLoad";
import { Button } from "./ui/button";

export function PageLoadRecovery({ onRetry }: { onRetry: () => void }) {
  const online = useBrowserOnline();
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="mx-auto my-8 w-full max-w-md rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_16%,transparent)] bg-[var(--app-card)] p-6 text-center text-[var(--app-ink)] shadow-sm"
    >
      <h1 id={titleId} className="text-xl font-semibold">
        {online ? "This page couldn’t load" : "You’re offline"}
      </h1>
      <p role="status" className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
        {online
          ? "Try again. If the app was updated while you were away, you may need to reload it."
          : "Reconnect to load this page, then try again. You can still open pages already loaded in this tab."}
      </p>
      <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
        <Button type="button" outline className="min-h-11" disabled={!online} onClick={onRetry}>
          <RotateCcw aria-hidden="true" />
          Try again
        </Button>
        <Button
          type="button"
          color="emerald"
          className="min-h-11"
          disabled={!online}
          onClick={() => window.location.reload()}
        >
          Reload app
        </Button>
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--app-muted)]">
        Reloading discards any unsaved edits in this tab.
      </p>
    </section>
  );
}

export default class PageLoadBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(error: unknown) {
    if (!(error instanceof PageLoadError)) throw error;
    return { failed: true };
  }

  render() {
    return this.state.failed
      ? <PageLoadRecovery onRetry={this.props.onRetry} />
      : this.props.children;
  }
}
