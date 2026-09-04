export type ReadspaceView = "articles" | "highlights";

export const READSPACE_VIEW_STORAGE_KEY = "favlock.readspace.last-view.v1";

export function loadReadspaceView(): ReadspaceView {
  try {
    const storedView = window.localStorage.getItem(READSPACE_VIEW_STORAGE_KEY);
    return storedView === "highlights" ? "highlights" : "articles";
  } catch {
    return "articles";
  }
}

export function saveReadspaceView(view: ReadspaceView): void {
  try {
    window.localStorage.setItem(READSPACE_VIEW_STORAGE_KEY, view);
  } catch {
    // The selected tab still works for this visit when storage is unavailable.
  }
}
