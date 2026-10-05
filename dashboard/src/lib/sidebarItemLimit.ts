export const SIDEBAR_ITEM_LIMIT_OPTIONS = [5, 10, 20, "all"] as const;

export type SidebarItemLimit = (typeof SIDEBAR_ITEM_LIMIT_OPTIONS)[number];

export const SIDEBAR_ITEM_LIMIT_STORAGE_KEY = "favlock.sidebar-item-limit";
const DEFAULT_SIDEBAR_ITEM_LIMIT: SidebarItemLimit = 5;
const listeners = new Set<() => void>();
let cachedLimit: SidebarItemLimit | null = null;

export function parseSidebarItemLimit(value: string | null): SidebarItemLimit {
  return (
    SIDEBAR_ITEM_LIMIT_OPTIONS.find((option) => String(option) === value) ??
    DEFAULT_SIDEBAR_ITEM_LIMIT
  );
}

function readSidebarItemLimit(): SidebarItemLimit {
  try {
    return parseSidebarItemLimit(
      localStorage.getItem(SIDEBAR_ITEM_LIMIT_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_SIDEBAR_ITEM_LIMIT;
  }
}

export function getSidebarItemLimit(): SidebarItemLimit {
  cachedLimit ??= readSidebarItemLimit();
  return cachedLimit;
}

export function setSidebarItemLimit(value: SidebarItemLimit) {
  cachedLimit = value;
  try {
    localStorage.setItem(SIDEBAR_ITEM_LIMIT_STORAGE_KEY, String(value));
  } catch {
    // Keep the selection usable for this session when storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeSidebarItemLimit(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SIDEBAR_ITEM_LIMIT_STORAGE_KEY && event.key !== null) {
      return;
    }
    cachedLimit = readSidebarItemLimit();
    listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The number of rows a sidebar section shows before "Show more". */
export function sidebarItemLimitCount(limit: SidebarItemLimit): number {
  return limit === "all" ? Number.POSITIVE_INFINITY : limit;
}
