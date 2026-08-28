import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./favLockAuth", () => import("../test/requestSessionAuthMock"));
import {
  fetchAccountSettings,
  updateAccountPreferences,
  updateAccountProfile,
} from "./accountSettingsApi";

const settings = {
  firstName: "Ada",
  lastName: "Lovelace",
  defaultSearchEngine: "duckduckgo",
  bookmarkSearchShortcutsEnabled: true,
  themeVariant: "sunset",
  searchHistoryMode: "cloud",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("account settings API client", () => {
  it("loads settings through the FavLock API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: settings }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAccountSettings("current.jwt.token")).resolves.toEqual(
      settings,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/account/settings",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer current.jwt.token",
        }),
        credentials: "omit",
      }),
    );
  });

  it("preserves an account without a user_info row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: null }), { status: 200 }),
      ),
    );

    await expect(fetchAccountSettings("current.jwt.token")).resolves.toBeNull();
  });

  it("updates the bounded profile through PATCH", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: settings }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateAccountProfile("current.jwt.token", {
        firstName: "Ada",
        lastName: "Lovelace",
      }),
    ).resolves.toEqual(settings);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/account/profile",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Authorization: "Bearer current.jwt.token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ firstName: "Ada", lastName: "Lovelace" }),
      }),
    );
  });

  it("updates only explicit preferences through PATCH", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: settings }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateAccountPreferences("current.jwt.token", {
      themeVariant: "aurora",
      bookmarkSearchShortcutsEnabled: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/account/preferences",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          themeVariant: "aurora",
          bookmarkSearchShortcutsEnabled: false,
        }),
      }),
    );
  });

  it.each([
    { ...settings, themeVariant: "unknown" },
    { ...settings, searchHistoryMode: "public" },
    { ...settings, firstName: 1 },
    { ...settings, bookmarkSearchShortcutsEnabled: "true" },
  ])("fails closed for malformed settings %#", async (data) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data }), { status: 200 }),
      ),
    );

    await expect(fetchAccountSettings("current.jwt.token")).rejects.toThrow(
      "could not load your account settings",
    );
  });

  it("does not expose API error details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "service_unavailable",
              message: "Internal user_info table detail",
            },
          }),
          { status: 503 },
        ),
      ),
    );

    await expect(
      updateAccountPreferences("current.jwt.token", {
        themeVariant: "sunset",
      }),
    ).rejects.toThrow("could not save your preferences");
  });
});
