export const LIBRARY_REVALIDATION_DEBOUNCE_MS = 350;
export const LIBRARY_REVALIDATION_MIN_INTERVAL_MS = 55_000;
export const LIBRARY_REVALIDATION_MAX_INTERVAL_MS = 65_000;

interface LibraryRevalidationOptions {
  random?: () => number;
}

function nextPollingDelay(random: () => number): number {
  const value = Math.min(1, Math.max(0, random()));
  return Math.floor(
    LIBRARY_REVALIDATION_MIN_INTERVAL_MS +
      value *
        (LIBRARY_REVALIDATION_MAX_INTERVAL_MS -
          LIBRARY_REVALIDATION_MIN_INTERVAL_MS),
  );
}

export function startLibraryRevalidation(
  revalidate: () => void,
  { random = Math.random }: LibraryRevalidationOptions = {},
): () => void {
  let stopped = false;
  let debounceTimer: number | null = null;
  let pollingTimer: number | null = null;

  const isActive = () =>
    document.visibilityState === "visible" && navigator.onLine;

  const clearDebounce = () => {
    if (debounceTimer === null) return;
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  };

  const clearPolling = () => {
    if (pollingTimer === null) return;
    window.clearTimeout(pollingTimer);
    pollingTimer = null;
  };

  const requestRevalidation = () => {
    if (stopped || !isActive()) return;
    clearDebounce();
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      if (!stopped && isActive()) revalidate();
    }, LIBRARY_REVALIDATION_DEBOUNCE_MS);
  };

  const schedulePolling = () => {
    clearPolling();
    if (stopped || !isActive()) return;
    pollingTimer = window.setTimeout(() => {
      pollingTimer = null;
      requestRevalidation();
      schedulePolling();
    }, nextPollingDelay(random));
  };

  const handleActivityChange = () => {
    if (!isActive()) {
      clearDebounce();
      clearPolling();
      return;
    }
    requestRevalidation();
    schedulePolling();
  };

  window.addEventListener("online", handleActivityChange);
  window.addEventListener("offline", handleActivityChange);
  window.addEventListener("focus", requestRevalidation);
  window.addEventListener("pageshow", requestRevalidation);
  document.addEventListener("visibilitychange", handleActivityChange);
  schedulePolling();

  return () => {
    stopped = true;
    clearDebounce();
    clearPolling();
    window.removeEventListener("online", handleActivityChange);
    window.removeEventListener("offline", handleActivityChange);
    window.removeEventListener("focus", requestRevalidation);
    window.removeEventListener("pageshow", requestRevalidation);
    document.removeEventListener("visibilitychange", handleActivityChange);
  };
}
