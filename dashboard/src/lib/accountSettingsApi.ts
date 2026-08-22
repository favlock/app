import type { ThemeVariant } from "../constants/themes";
import { fetchAuthenticatedJson, patchAuthenticatedJson } from "./authenticatedApi";
import type { SearchHistoryMode } from "./searchHistory";

const ACCOUNT_SETTINGS_ERROR =
  "We could not load your account settings. Please try again.";
const ACCOUNT_PROFILE_ERROR =
  "We could not save your profile. Please try again.";
const ACCOUNT_PREFERENCES_ERROR =
  "We could not save your preferences. Please try again.";

const THEME_VARIANTS: ThemeVariant[] = ["sunset", "retro", "neon", "aurora"];
const SEARCH_HISTORY_MODES: SearchHistoryMode[] = ["cloud", "local", "off"];

export type SearchEngineSlug =
  | "bing"
  | "brave"
  | "duckduckgo"
  | "ecosia"
  | "google"
  | "qwant"
  | "yahoo";

const SEARCH_ENGINE_SLUGS: SearchEngineSlug[] = [
  "bing",
  "brave",
  "duckduckgo",
  "ecosia",
  "google",
  "qwant",
  "yahoo",
];

export interface AccountSettings {
  firstName: string;
  lastName: string;
  defaultSearchEngine: string | null;
  bookmarkSearchShortcutsEnabled: boolean | null;
  themeVariant: ThemeVariant;
  searchHistoryMode: SearchHistoryMode;
}

export interface AccountPreferencesPatch {
  defaultSearchEngine?: SearchEngineSlug;
  bookmarkSearchShortcutsEnabled?: boolean;
  themeVariant?: ThemeVariant;
  searchHistoryMode?: SearchHistoryMode;
}

export function isSearchEngineSlug(value: string): value is SearchEngineSlug {
  return SEARCH_ENGINE_SLUGS.some((slug) => slug === value);
}

function isThemeVariant(value: unknown): value is ThemeVariant {
  return THEME_VARIANTS.some((variant) => variant === value);
}

function isSearchHistoryMode(value: unknown): value is SearchHistoryMode {
  return SEARCH_HISTORY_MODES.some((mode) => mode === value);
}

function parseAccountSettings(
  value: unknown,
  allowNull: boolean,
  failureMessage: string,
): AccountSettings | null {
  if (!value || typeof value !== "object") throw new Error(failureMessage);
  const response = value as Record<string, unknown>;
  if (response.data === null && allowNull) return null;
  if (!response.data || typeof response.data !== "object") {
    throw new Error(failureMessage);
  }
  const settings = response.data as Record<string, unknown>;

  if (
    typeof settings.firstName !== "string" ||
    settings.firstName.length > 256 ||
    typeof settings.lastName !== "string" ||
    settings.lastName.length > 256 ||
    (settings.defaultSearchEngine !== null &&
      (typeof settings.defaultSearchEngine !== "string" ||
        settings.defaultSearchEngine.length === 0 ||
        settings.defaultSearchEngine.length > 64)) ||
    (settings.bookmarkSearchShortcutsEnabled !== null &&
      typeof settings.bookmarkSearchShortcutsEnabled !== "boolean") ||
    !isThemeVariant(settings.themeVariant) ||
    !isSearchHistoryMode(settings.searchHistoryMode)
  ) {
    throw new Error(failureMessage);
  }

  return {
    firstName: settings.firstName,
    lastName: settings.lastName,
    defaultSearchEngine: settings.defaultSearchEngine,
    bookmarkSearchShortcutsEnabled: settings.bookmarkSearchShortcutsEnabled,
    themeVariant: settings.themeVariant,
    searchHistoryMode: settings.searchHistoryMode,
  };
}

function requireAccountSettings(
  value: unknown,
  failureMessage: string,
): AccountSettings {
  const settings = parseAccountSettings(value, false, failureMessage);
  if (!settings) throw new Error(failureMessage);
  return settings;
}

export async function fetchAccountSettings(
  accessToken: string,
): Promise<AccountSettings | null> {
  const payload = await fetchAuthenticatedJson(
    "/v1/account/settings",
    accessToken,
    ACCOUNT_SETTINGS_ERROR,
  );
  return parseAccountSettings(payload, true, ACCOUNT_SETTINGS_ERROR);
}

export async function updateAccountProfile(
  accessToken: string,
  profile: { firstName: string; lastName: string },
): Promise<AccountSettings> {
  const payload = await patchAuthenticatedJson(
    "/v1/account/profile",
    accessToken,
    profile,
    ACCOUNT_PROFILE_ERROR,
  );
  return requireAccountSettings(payload, ACCOUNT_PROFILE_ERROR);
}

export async function updateAccountPreferences(
  accessToken: string,
  preferences: AccountPreferencesPatch,
): Promise<AccountSettings> {
  const payload = await patchAuthenticatedJson(
    "/v1/account/preferences",
    accessToken,
    preferences,
    ACCOUNT_PREFERENCES_ERROR,
  );
  return requireAccountSettings(payload, ACCOUNT_PREFERENCES_ERROR);
}
