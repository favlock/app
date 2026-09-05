export const DEFAULT_USE_FAVLOCK_NEW_TAB = false;
export const DEFAULT_SHOW_HIGHLIGHTS_ON_WEBPAGES = true;

export function resolveUseFavLockNewTab(value) {
  return typeof value === "boolean" ? value : DEFAULT_USE_FAVLOCK_NEW_TAB;
}

export function resolveShowHighlightsOnWebpages(value) {
  return typeof value === "boolean"
    ? value
    : DEFAULT_SHOW_HIGHLIGHTS_ON_WEBPAGES;
}
