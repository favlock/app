import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAccountSettings: vi.fn(),
  fetchCachedEncryptionVerifier: vi.fn(),
}));

vi.mock("./accountSettingsApi", () => ({
  fetchAccountSettings: mocks.fetchAccountSettings,
}));

vi.mock("./encryptionMetadataApi", () => ({
  fetchCachedEncryptionVerifier: mocks.fetchCachedEncryptionVerifier,
}));

import { fetchUserInfo } from "./userInfo";

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.fetchAccountSettings.mockResolvedValue({
    firstName: "Ada",
    lastName: "Lovelace",
    defaultSearchEngine: "duckduckgo",
    bookmarkSearchShortcutsEnabled: true,
    themeVariant: "sunset",
    searchHistoryMode: "cloud",
  });
  mocks.fetchCachedEncryptionVerifier.mockResolvedValue("enc:verifier");
});

describe("fetchUserInfo", () => {
  it("loads public settings and the verifier through the API", async () => {
    await expect(fetchUserInfo("current.jwt.token", "user-a")).resolves.toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      default_search_engine: "duckduckgo",
      bookmark_search_shortcuts_enabled: true,
      theme_variant: "sunset",
      key_verifier: "enc:verifier",
      search_history_mode: "cloud",
    });

    expect(mocks.fetchAccountSettings).toHaveBeenCalledExactlyOnceWith(
      "current.jwt.token",
    );
    expect(mocks.fetchCachedEncryptionVerifier).toHaveBeenCalledExactlyOnceWith(
      "current.jwt.token",
      "user-a",
    );
  });

  it("preserves a missing user_info row", async () => {
    mocks.fetchAccountSettings.mockResolvedValue(null);
    mocks.fetchCachedEncryptionVerifier.mockResolvedValue(null);

    await expect(fetchUserInfo("current.jwt.token", "user-a")).resolves.toBeNull();
  });

  it("does not hide a failed encryption-verifier read", async () => {
    mocks.fetchCachedEncryptionVerifier.mockRejectedValue(new Error("request failed"));

    await expect(fetchUserInfo("current.jwt.token", "user-a")).rejects.toThrow(
      "request failed",
    );
  });
});
