import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("FavLock encountered an unexpected error", error, info);
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--app-bg,#f7fafc)] px-5 py-10">
        <section
          className="w-full max-w-md rounded-2xl border border-red-500/20 bg-white p-6 text-center shadow-lg"
          aria-labelledby="app-error-title"
        >
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-600">
            <AlertTriangle aria-hidden="true" />
          </div>
          <h1
            id="app-error-title"
            className="mt-4 text-xl font-bold text-gray-900"
          >
            Something went wrong
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Your bookmarks are safe. Try loading this screen again, or reload
            the app if the problem continues.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button type="button" outline onClick={this.retry}>
              <RotateCcw aria-hidden="true" />
              Try again
            </Button>
            <Button
              type="button"
              color="emerald"
              onClick={() => window.location.reload()}
            >
              Reload app
            </Button>
          </div>
        </section>
      </main>
    );
  }
}
