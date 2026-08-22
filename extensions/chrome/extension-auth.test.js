import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEmailAuthorizationUrl,
  buildGoogleAuthorizationUrl,
  createPkceChallenge,
  createRandomUrlToken,
  exchangeAuthorizationCode,
  exchangeExtensionSessionToken,
  refreshSession,
} from "./extension-auth.js";
import { FAVLOCK_CONFIG } from "./config.js";

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

let storageSet;

beforeEach(() => {
  storageSet = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: storageSet,
        remove: vi.fn().mockResolvedValue(undefined),
      },
      session: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extension OAuth helpers", () => {
  it("creates URL-safe state and verifier values", () => {
    expect(createRandomUrlToken(32)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("creates the RFC 7636 SHA-256 challenge", async () => {
    await expect(
      createPkceChallenge(
        "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      ),
    ).resolves.toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("uses the existing Supabase Google provider with a PKCE callback", () => {
    const redirectUri = `https://${"a".repeat(32)}.chromiumapp.org/favlock`;
    const url = buildGoogleAuthorizationUrl({
      redirectUri,
      state: "csrf-state",
      codeChallenge: "pkce-challenge",
    });

    expect(url.pathname).toBe("/auth/v1/authorize");
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("code_challenge_method")).toBe("s256");
    expect(url.searchParams.get("code_challenge")).toBe("pkce-challenge");
    expect(url.searchParams.get("redirect_to")).toBe(
      `${redirectUri}?state=csrf-state`,
    );
  });

  it("opens the dashboard email login and preserves the extension pairing destination", () => {
    const extensionId = "a".repeat(32);
    const url = buildEmailAuthorizationUrl({
      dashboardUrl: "https://vault.favlock.app/",
      extensionId,
    });

    expect(url.origin).toBe("https://vault.favlock.app");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe(
      `/extension/pair?extensionId=${extensionId}&auth=email`,
    );
  });

  it("exchanges the Google PKCE code and verifies the user through FavLock API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(sessionResponse()))
      .mockResolvedValueOnce(jsonResponse({ data: { user } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      exchangeAuthorizationCode({
        code: "authorization-code",
        codeVerifier: "v".repeat(64),
      }),
    ).resolves.toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      userId: user.id,
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${FAVLOCK_CONFIG.apiUrl}/v1/auth/session/exchange`,
      `${FAVLOCK_CONFIG.apiUrl}/v1/auth/session/user`,
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      authCode: "authorization-code",
      codeVerifier: "v".repeat(64),
    });
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      Authorization: "Bearer access-token",
    });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toMatch(
      /apikey|supabasePublishableKey|auth\/v1\/token/,
    );
    expect(storageSet).toHaveBeenCalledOnce();
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
});
