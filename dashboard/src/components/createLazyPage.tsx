import {
  lazy,
  Suspense,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { loadPageModule } from "../lib/pageLoad";
import PageLoadBoundary from "./PageLoadBoundary";

type PageModule = { default: ComponentType };

export function createLazyPage(
  load: () => Promise<PageModule>,
  fallback: ReactNode = (
    <div className="flex min-h-40 items-center justify-center text-sm text-[var(--app-muted)]" role="status">
      Loading…
    </div>
  ),
) {
  const createPage = () => lazy(() => loadPageModule(load));
  let CurrentPage = createPage();

  return function LazyPage() {
    const [attempt, setAttempt] = useState({ Page: CurrentPage, key: 0 });
    const { Page } = attempt;

    return (
      <PageLoadBoundary
        key={attempt.key}
        onRetry={() => {
          // React caches rejected lazy promises. Reset both the lazy component
          // and its boundary; a boundary reset alone cannot retry the import.
          const NextPage = createPage();
          CurrentPage = NextPage;
          setAttempt((current) => ({ Page: NextPage, key: current.key + 1 }));
        }}
      >
        <Suspense fallback={fallback}>
          <Page />
        </Suspense>
      </PageLoadBoundary>
    );
  };
}
