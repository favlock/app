import { isBrowserOnline } from "./network";

export const PAGE_LOAD_RETRY_DELAY_MS = 500;

export class PageLoadError extends Error {
  constructor() {
    super("The page could not be downloaded.");
    this.name = "PageLoadError";
  }
}

function isModuleDownloadError(error: unknown): boolean {
  return error instanceof Error && (
    /Failed to fetch dynamically imported module/i.test(error.message) ||
    /Importing a module script failed/i.test(error.message) ||
    /error loading dynamically imported module/i.test(error.message) ||
    /Unable to preload CSS for/i.test(error.message)
  );
}

export async function loadPageModule<T>(load: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      // Evaluation/render bugs must still reach the normal app error boundary.
      if (!isModuleDownloadError(error)) throw error;
      if (attempt === 1 || !isBrowserOnline()) throw new PageLoadError();
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, PAGE_LOAD_RETRY_DELAY_MS),
      );
      if (!isBrowserOnline()) throw new PageLoadError();
    }
  }
  throw new PageLoadError();
}
