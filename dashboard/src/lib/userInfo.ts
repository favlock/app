import type { ThemeVariant } from "../constants/themes";
import type { SearchHistoryMode } from "./searchHistory";
import { fetchAccountSettings } from "./accountSettingsApi";
import { fetchEncryptionVerifier } from "./encryptionMetadataApi";

export const USER_INFO_STALE_TIME = 1000 * 60 * 5;

export const userInfoQueryKey = (userId: string | undefined) => [
  "user_info",
  userId,
];

export interface UserInfo {
  first_name: string;
  last_name: string;
  default_search_engine: string | null;
  bookmark_search_shortcuts_enabled: boolean | null;
  theme_variant: ThemeVariant;
  key_verifier: string | null;
  search_history_mode: SearchHistoryMode;
}

export async function fetchUserInfo(
  accessToken: string,
): Promise<UserInfo | null> {
  const [settings, keyVerifier] = await Promise.all([
    fetchAccountSettings(accessToken),
    fetchEncryptionVerifier(accessToken),
  ]);

  if (!settings) return null;
  return {
    first_name: settings.firstName,
    last_name: settings.lastName,
    default_search_engine: settings.defaultSearchEngine,
    bookmark_search_shortcuts_enabled:
      settings.bookmarkSearchShortcutsEnabled,
    theme_variant: settings.themeVariant,
    key_verifier: keyVerifier,
    search_history_mode: settings.searchHistoryMode,
  };
}
