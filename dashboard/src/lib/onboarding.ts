export const ONBOARDING_STORAGE_KEY = "favlock:onboarding:hidden:v1";

export function isOnboardingHidden() {
  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveOnboardingPreference(hidden: boolean) {
  try {
    if (hidden) {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    }
  } catch {
    // The tour still works when browser storage is unavailable.
  }
}
