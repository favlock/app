import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIBRARY_REVALIDATION_DEBOUNCE_MS,
  LIBRARY_REVALIDATION_MIN_INTERVAL_MS,
  startLibraryRevalidation,
} from "./libraryRevalidation";

describe("library cache revalidation scheduling", () => {
  let online = true;
  let visibilityState: DocumentVisibilityState = "visible";

  beforeEach(() => {
    online = true;
    visibilityState = "visible";
    vi.useFakeTimers();
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibilityState,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("revalidates on a jittered interval only while visible and online", () => {
    const revalidate = vi.fn();
    const stop = startLibraryRevalidation(revalidate, { random: () => 0 });

    vi.advanceTimersByTime(LIBRARY_REVALIDATION_MIN_INTERVAL_MS - 1);
    expect(revalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1 + LIBRARY_REVALIDATION_DEBOUNCE_MS);
    expect(revalidate).toHaveBeenCalledOnce();

    visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(
      LIBRARY_REVALIDATION_MIN_INTERVAL_MS +
        LIBRARY_REVALIDATION_DEBOUNCE_MS,
    );
    expect(revalidate).toHaveBeenCalledOnce();

    stop();
  });

  it("revalidates after becoming active and debounces focus bursts", () => {
    online = false;
    const revalidate = vi.fn();
    const stop = startLibraryRevalidation(revalidate, { random: () => 0 });

    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(LIBRARY_REVALIDATION_DEBOUNCE_MS);
    expect(revalidate).not.toHaveBeenCalled();

    online = true;
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(LIBRARY_REVALIDATION_DEBOUNCE_MS);
    expect(revalidate).toHaveBeenCalledOnce();

    stop();
  });

  it("removes listeners and pending timers when stopped", () => {
    const revalidate = vi.fn();
    const stop = startLibraryRevalidation(revalidate, { random: () => 0 });

    window.dispatchEvent(new Event("focus"));
    stop();
    vi.advanceTimersByTime(
      LIBRARY_REVALIDATION_MIN_INTERVAL_MS +
        LIBRARY_REVALIDATION_DEBOUNCE_MS,
    );
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    vi.runOnlyPendingTimers();

    expect(revalidate).not.toHaveBeenCalled();
  });
});
