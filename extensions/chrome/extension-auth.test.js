import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginExtensionConnection,
  buildExtensionPairUrl,
  createRandomUrlToken,
  exchangeExtensionSessionToken,
  getConnectionState,
  refreshSession,
  disconnectExtension,
  receivePairedKey,
  PAIR_KEY_MESSAGE,
} from "./extension-auth.js";
import { FAVLOCK_CONFIG } from "./config.js";

const cryptoMocks = vi.hoisted(() => ({
  deleteLibraryKey: vi.fn().mockResolvedValue(undefined),
  importLibraryKey: vi.fn(),
  loadLibraryKey: vi.fn().mockResolvedValue({ type: "secret" }),
  saveLibraryKey: vi.fn(),
}));

vi.mock("./extension-crypto.js", () => cryptoMocks);

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ada@example.com",
};

function sessionResponse() {
  return {
    data: {
      session: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresIn: 3600,
        expiresAt: 1_900_000_000,
        user,
      },
    },
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let storageGet;
let storageSet;
let storageRemove;
let localData;
let sessionData;

beforeEach(() => {
  localData = {};
  sessionData = {};
  storageGet = vi.fn(async () => ({ ...localData }));
  storageSet = vi.fn(async (value) => { Object.assign(localData, value); });
  storageRemove = vi.fn(async (keys) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete localData[key]; });
  cryptoMocks.deleteLibraryKey.mockClear();
  cryptoMocks.importLibraryKey.mockReset();
  cryptoMocks.loadLibraryKey.mockClear();
  cryptoMocks.saveLibraryKey.mockReset();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: storageGet,
        set: storageSet,
        remove: storageRemove,
      },
      session: {
        get: vi.fn(async () => ({ ...sessionData })),
        set: vi.fn(async (value) => { Object.assign(sessionData, value); }),
        remove: vi.fn(async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete sessionData[key];
          }
        }),
      },
    },
    runtime: { id: "a".repeat(32) },
    tabs: {
      create: vi.fn().mockResolvedValue({}),
      query: vi.fn().mockResolvedValue([{ id: 42 }]),
      update: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    action: {
      setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
      setBadgeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extension dashboard connection", () => {
  it("rejects pairing another account before exchanging credentials or replacing a key", async () => {
    localData.favlockLocalProfile = { version: 1, userId: user.id, email: user.email, cloudStatus: "reconnect_required" };
    sessionData.favlockPairingAttempt = { value: "p".repeat(43), expiresAt: Date.now() + 60_000 };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await receivePairedKey({ type: PAIR_KEY_MESSAGE, pairingAttempt: "p".repeat(43), userId: "22222222-2222-4222-8222-222222222222", sessionTokenHash: "token", rawKey: "test" }, { origin: new URL(FAVLOCK_CONFIG.dashboardUrl).origin });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("different account") });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cryptoMocks.deleteLibraryKey).not.toHaveBeenCalled();
  });

  it("cannot resurrect credentials after explicit disconnect during refresh", async () => {
    const stored = { accessToken: "old", refreshToken: "old-refresh", expiresAt: 1, userId: user.id, email: user.email };
    localData.favlockAuthSession = stored;
    sessionData.favlockOriginalTabId = 42;
    sessionData.favlockPairingAttempt = { value: "p".repeat(43), expiresAt: Date.now() + 60_000 };
    let finish;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { finish = resolve; })));
    const refreshing = refreshSession(stored);
    const rejected = expect(refreshing).rejects.toThrow("account changed");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await disconnectExtension();
    finish(jsonResponse(sessionResponse()));
    await rejected;
    expect(localData.favlockAuthSession).toBeUndefined();
    expect(localData.favlockLocalProfile).toBeUndefined();
    expect(sessionData.favlockOriginalTabId).toBeUndefined();
    expect(sessionData.favlockPairingAttempt).toBeUndefined();
    expect(cryptoMocks.deleteLibraryKey).toHaveBeenCalledOnce();
  });

  it("keeps the local profile visible if cloud credentials are missing", async () => {
    localData.favlockLocalProfile = { version: 1, userId: user.id, email: user.email, cloudStatus: "reconnect_required" };
    await expect(getConnectionState()).resolves.toMatchObject({ connected: true, unlocked: true, email: user.email, cloudStatus: "reconnect_required" });
  });
  it("creates URL-safe state and verifier values", () => {
    expect(createRandomUrlToken(32)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("builds one protected dashboard pairing destination", () => {
    const extensionId = "a".repeat(32);
    const pairingAttempt = "p".repeat(43);
    const url = buildExtensionPairUrl({
      dashboardUrl: "https://vault.favlock.app/",
      extensionId,
      pairingAttempt,
    });

    expect(url.origin).toBe("https://vault.favlock.app");
    expect(url.pathname).toBe("/extension/pair");
    expect(url.searchParams.get("extensionId")).toBe(extensionId);
    expect(url.searchParams.get("attempt")).toBe(pairingAttempt);
  });

  it("opens the dashboard pairing route and records a short-lived attempt", async () => {
    await expect(beginExtensionConnection()).resolves.toEqual({ needsKey: true });
    const openedUrl = new URL(chrome.tabs.create.mock.calls[0][0].url);
    const attempt = openedUrl.searchParams.get("attempt");

    expect(openedUrl.pathname).toBe("/extension/pair");
    expect(openedUrl.searchParams.get("extensionId")).toBe(chrome.runtime.id);
    expect(attempt).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessionData.favlockPairingAttempt).toMatchObject({ value: attempt });
    expect(sessionData.favlockPairingAttempt.expiresAt).toBeGreaterThan(Date.now());
    expect(sessionData.favlockOriginalTabId).toBe(42);
  });

  it("rejects a pairing response that does not match the current attempt", async () => {
    sessionData.favlockPairingAttempt = { value: "p".repeat(43), expiresAt: Date.now() + 60_000 };
    const result = await receivePairedKey(
      { type: PAIR_KEY_MESSAGE, pairingAttempt: "x".repeat(43), userId: user.id, sessionTokenHash: "token", rawKey: "test" },
      { origin: new URL(FAVLOCK_CONFIG.dashboardUrl).origin },
    );

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("expired") });
    expect(cryptoMocks.importLibraryKey).not.toHaveBeenCalled();
  });

  it("accepts one matching dashboard handoff and consumes the attempt", async () => {
    const pairingAttempt = "p".repeat(43);
    sessionData.favlockPairingAttempt = { value: pairingAttempt, expiresAt: Date.now() + 60_000 };
    cryptoMocks.importLibraryKey.mockResolvedValueOnce({ type: "secret" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(sessionResponse())));

    const result = await receivePairedKey(
      { type: PAIR_KEY_MESSAGE, pairingAttempt, userId: user.id, sessionTokenHash: "one-time-token", rawKey: "test-key" },
      { origin: new URL(FAVLOCK_CONFIG.dashboardUrl).origin },
    );

    expect(result).toEqual({ ok: true });
    expect(localData.favlockAuthSession).toMatchObject({ userId: user.id, refreshToken: "refresh-token" });
    expect(cryptoMocks.saveLibraryKey).toHaveBeenCalledOnce();
    expect(sessionData.favlockPairingAttempt).toBeUndefined();
  });

  it("exchanges the dashboard one-time token through the fixed API verifier", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sessionResponse()));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      exchangeExtensionSessionToken({
        tokenHash: "one-time-token",
        expectedUserId: user.id,
      }),
    ).resolves.toMatchObject({ userId: user.id, email: user.email });

    expect(fetchMock).toHaveBeenCalledWith(
      `${FAVLOCK_CONFIG.apiUrl}/v1/auth/session/verify`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ tokenHash: "one-time-token" }),
      }),
    );
  });

  it("rejects a one-time token session bound to a different dashboard user", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sessionResponse()));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      exchangeExtensionSessionToken({
        tokenHash: "one-time-token",
        expectedUserId: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toThrow("The paired FavLock account does not match.");
    expect(storageSet).not.toHaveBeenCalled();
  });

  it("refreshes the stored extension session through FavLock API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sessionResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const stored = {
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
      expiresAt: 1,
      userId: user.id,
      email: user.email,
    };

    localData.favlockAuthSession = stored;
    await expect(refreshSession(stored)).resolves.toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      userId: user.id,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${FAVLOCK_CONFIG.apiUrl}/v1/auth/session/refresh`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ refreshToken: "old-refresh-token" }),
      }),
    );
    expect(storageSet).toHaveBeenCalledOnce();
  });

  it("preserves the extension session and key when refresh fails temporarily", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const stored = {
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
      expiresAt: 1,
      userId: user.id,
      email: user.email,
    };

    localData.favlockAuthSession = stored;
    await expect(refreshSession(stored)).rejects.toThrow(
      "FavLock is temporarily unavailable. Try again.",
    );
    expect(storageRemove).not.toHaveBeenCalled();
    expect(cryptoMocks.deleteLibraryKey).not.toHaveBeenCalled();
  });

  it("keeps the stored connection visible during a temporary refresh failure", async () => {
    const stored = {
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
      expiresAt: 1,
      userId: user.id,
      email: user.email,
    };
    localData.favlockAuthSession = stored;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(getConnectionState()).resolves.toEqual({
      connected: true,
      unlocked: true,
      email: user.email,
      cloudStatus: "unavailable",
    });
    expect(storageRemove).not.toHaveBeenCalled();
    expect(cryptoMocks.deleteLibraryKey).not.toHaveBeenCalled();
  });

  it("retains the local account and key when refresh credentials are rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "session_expired",
              message: "Your session has expired. Sign in again.",
            },
          },
          401,
        ),
      ),
    );
    const stored = {
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
      expiresAt: 1,
      userId: user.id,
      email: user.email,
    };

    localData.favlockAuthSession = stored;
    await expect(refreshSession(stored)).rejects.toThrow(
      "your saved key remains on this device",
    );
    expect(storageRemove).not.toHaveBeenCalled();
    expect(cryptoMocks.deleteLibraryKey).not.toHaveBeenCalled();
    expect(localData.favlockLocalProfile.cloudStatus).toBe("reconnect_required");
  });
});
