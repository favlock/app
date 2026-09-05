export type Appearance = "light" | "dark" | "auto";

export const APPEARANCE_STORAGE_KEY = "favlock.appearance";
const listeners = new Set<() => void>();
let appearance: Appearance = "auto";

function parseAppearance(value: string | null): Appearance {
  return value === "light" || value === "dark" ? value : "auto";
}

function readAppearance(): Appearance {
  try {
    return parseAppearance(localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

function applyAppearance() {
  const dark = appearance === "dark" ||
    (appearance === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.appearance = dark ? "dark" : "light";
}

export function initializeAppearance() {
  appearance = readAppearance();
  applyAppearance();
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onStorage = (event: StorageEvent) => {
    if (event.key !== APPEARANCE_STORAGE_KEY && event.key !== null) return;
    appearance = readAppearance();
    applyAppearance();
    listeners.forEach((listener) => listener());
  };
  media.addEventListener("change", applyAppearance);
  window.addEventListener("storage", onStorage);
  return () => {
    media.removeEventListener("change", applyAppearance);
    window.removeEventListener("storage", onStorage);
  };
}

export function setAppearance(value: Appearance) {
  appearance = value;
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, value);
  } catch {
    // Keep the selection usable for this session when storage is unavailable.
  }
  applyAppearance();
  listeners.forEach((listener) => listener());
}

export function getAppearance() {
  return appearance;
}

export function subscribeAppearance(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
