import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAccountSettings: vi.fn(),
  fetchEncryptionVerifier: vi.fn(),
}));

vi.mock("./accountSettingsApi", () => ({
  fetchAccountSettings: mocks.fetchAccountSettings,
}));

vi.mock("./encryptionMetadataApi", () => ({
  fetchEncryptionVerifier: mocks.fetchEncryptionVerifier,
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
  mocks.fetchEncryptionVerifier.mockResolvedValue("enc:verifier");
});

describe("fetchUserInfo", () => {
  it("loads public settings and the verifier through the API", async () => {
    await expect(fetchUserInfo("current.jwt.token")).resolves.toEqual({
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
    expect(mocks.fetchEncryptionVerifier).toHaveBeenCalledExactlyOnceWith(
      "current.jwt.token",
    );
  });

  it("preserves a missing user_info row", async () => {
    mocks.fetchAccountSettings.mockResolvedValue(null);
    mocks.fetchEncryptionVerifier.mockResolvedValue(null);

    await expect(fetchUserInfo("current.jwt.token")).resolves.toBeNull();
  });

  it("does not hide a failed encryption-verifier read", async () => {
    mocks.fetchEncryptionVerifier.mockRejectedValue(new Error("request failed"));

    await expect(fetchUserInfo("current.jwt.token")).rejects.toThrow(
      "request failed",
    );
  });
});
