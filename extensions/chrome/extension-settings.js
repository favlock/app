export const DEFAULT_USE_FAVLOCK_NEW_TAB = false;

export function resolveUseFavLockNewTab(value) {
  return typeof value === "boolean" ? value : DEFAULT_USE_FAVLOCK_NEW_TAB;
}
