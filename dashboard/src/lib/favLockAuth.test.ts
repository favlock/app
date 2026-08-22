import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FavLockAuthClient, type AuthSession } from "./favLockAuth";

const API_URL = "https://api.favlock.example";
const AUTH_URL = "https://auth.favlock.example";
const DASHBOARD_URL = "https://dashboard.favlock.example";
const SESSION_STORAGE_KEY = "favlock.auth.session.v1";
const PKCE_STORAGE_KEY = "favlock.auth.pkce.v1";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function apiSession(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresIn: 3600,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: USER_ID,
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      createdAt: "2026-08-20T08:00:00.000Z",
      passwordSignInEnabled: true,
    },
    ...overrides,
  };
}

function storedSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: USER_ID,
      email: "ada@example.com",
      created_at: "2026-08-20T08:00:00.000Z",
      user_metadata: {
        first_name: "Ada",
        last_name: "Lovelace",
        password_sign_in_enabled: true,
      },
      app_metadata: { provider: "email", providers: ["email"] },
      identities: [{ provider: "email" }],
    },
    ...overrides,
  };
}

function createClient(fetchImplementation = vi.fn()): FavLockAuthClient {
  return new FavLockAuthClient({
    apiUrl: API_URL,
    authUrl: AUTH_URL,
    dashboardUrl: DASHBOARD_URL,
    fetchImplementation: fetchImplementation as typeof fetch,
    navigate: vi.fn(),
  });
}

function clearCookies(): void {
  for (const item of document.cookie.split(";")) {
    const name = item.trim().split("=")[0];
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

describe("FavLockAuthClient", () => {
  const clients: FavLockAuthClient[] = [];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearCookies();
    window.history.replaceState({}, "", "/login");
  });

  afterEach(() => {
    for (const client of clients) client.dispose();
    clients.length = 0;
    vi.restoreAllMocks();
  });

  function trackedClient(fetchImplementation = vi.fn()) {
    const client = createClient(fetchImplementation);
    clients.push(client);
    return client;
  }

  it("starts Google OAuth on the configured Auth origin with S256 PKCE", async () => {
    const navigate = vi.fn();
    const client = new FavLockAuthClient({
      apiUrl: API_URL,
      authUrl: AUTH_URL,
      dashboardUrl: DASHBOARD_URL,
      fetchImplementation: vi.fn() as typeof fetch,
      navigate,
    });
    clients.push(client);

    const result = await client.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${DASHBOARD_URL}/settings?tab=security` },
    });

    expect(result.error).toBeNull();
    const destination = new URL(navigate.mock.calls[0][0] as string);
    expect(destination.origin).toBe(AUTH_URL);
    expect(destination.pathname).toBe("/auth/v1/authorize");
    expect(destination.searchParams.get("provider")).toBe("google");
    expect(destination.searchParams.get("redirect_to")).toBe(
      `${DASHBOARD_URL}/settings?tab=security`,
    );
    expect(destination.searchParams.get("code_challenge_method")).toBe("s256");
    expect(destination.searchParams.get("code_challenge")).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
    expect(JSON.parse(localStorage.getItem(PKCE_STORAGE_KEY)!)).toMatchObject({
      verifier: expect.stringMatching(/^[A-Za-z0-9_-]{64}$/),
      redirectType: "sign-in",
    });
  });

  it("rejects an OAuth redirect outside the dashboard origin", async () => {
    const navigate = vi.fn();
    const client = new FavLockAuthClient({
      apiUrl: API_URL,
      authUrl: AUTH_URL,
      dashboardUrl: DASHBOARD_URL,
      fetchImplementation: vi.fn() as typeof fetch,
      navigate,
    });
    clients.push(client);

    const result = await client.signInWithOAuth({
      provider: "google",
      options: { redirectTo: "https://attacker.example/steal" },
    });

    expect(result.error?.message).toBe("The sign-in destination is invalid.");
    expect(navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).toBeNull();
  });

  it("dispatches password sign-in with fetch bound to the browser global", async () => {
    const fetchMock = vi.fn(function (this: unknown) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve(
        response({ data: { session: apiSession() } }),
      );
    });
    const client = trackedClient(fetchMock);

    const result = await client.signInWithPassword({
      email: "ada@example.com",
      password: "correct horse battery staple",
      options: { captchaToken: "captcha-token" },
    });

    expect(result.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`${API_URL}/v1/auth/sign-in/password`);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body as string)).toEqual({
      email: "ada@example.com",
      password: "correct horse battery staple",
      captchaToken: "captcha-token",
    });
  });

  it("sends sign-up through the narrow API route and retains PKCE for confirmation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ data: { confirmationRequired: true, session: null } }, 202));
    const client = trackedClient(fetchMock);

    const result = await client.signUp({
      email: "ada@example.com",
      password: "correct horse battery staple",
      options: {
        captchaToken: "captcha-token",
        emailRedirectTo: `${DASHBOARD_URL}/library?welcome=1`,
        data: { first_name: " Ada ", last_name: " Lovelace " },
      },
    });

    expect(result).toEqual({ data: { user: null, session: null }, error: null });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/v1/auth/sign-up`);
    expect(options.credentials).toBe("omit");
    expect(options.referrerPolicy).toBe("no-referrer");
    expect(options.cache).toBe("no-store");
    expect(JSON.parse(options.body as string)).toMatchObject({
      email: "ada@example.com",
      password: "correct horse battery staple",
      firstName: "Ada",
      lastName: "Lovelace",
      captchaToken: "captcha-token",
      pkceCodeChallenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      pkceCodeChallengeMethod: "s256",
      redirectTarget: "/library?welcome=1",
    });
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).not.toBeNull();
  });

  it("exchanges an auth callback, stores the session, and preserves unrelated query parameters", async () => {
    const verifier = "v".repeat(64);
    localStorage.setItem(
      PKCE_STORAGE_KEY,
      JSON.stringify({ verifier, redirectType: "sign-in" }),
    );
    window.history.replaceState({}, "", "/library?code=auth-code&view=compact&sb_flow_id=old");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ data: { session: apiSession() } }));
    const client = trackedClient(fetchMock);

    const result = await client.getSession();

    expect(result.error).toBeNull();
    expect(result.data.session?.user.email).toBe("ada@example.com");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/v1/auth/session/exchange`);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      authCode: "auth-code",
      codeVerifier: verifier,
    });
    expect(window.location.pathname).toBe("/library");
    expect(window.location.search).toBe("?view=compact");
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!)).toMatchObject({
      access_token: "access-token",
      refresh_token: "refresh-token",
      user: { id: USER_ID },
    });
  });

  it("emits a password-recovery event after exchanging a recovery callback", async () => {
    localStorage.setItem(
      PKCE_STORAGE_KEY,
      JSON.stringify({ verifier: "r".repeat(64), redirectType: "recovery" }),
    );
    window.history.replaceState({}, "", "/reset-password?code=recovery-code");
    const client = trackedClient(
      vi.fn().mockResolvedValue(response({ data: { session: apiSession() } })),
    );
    const listener = vi.fn();
    client.onAuthStateChange(listener);

    await client.getSession();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledWith(
      "PASSWORD_RECOVERY",
      expect.objectContaining({ access_token: "access-token" }),
    );
  });

  it("retains callback PKCE after a transient exchange failure so reload can retry", async () => {
    localStorage.setItem(
      PKCE_STORAGE_KEY,
      JSON.stringify({ verifier: "t".repeat(64), redirectType: "sign-in" }),
    );
    window.history.replaceState({}, "", "/library?code=auth-code");
    const client = trackedClient(
      vi.fn().mockRejectedValue(new TypeError("offline")),
    );

    const result = await client.getSession();

    expect(result.error?.message).toBe("Authentication is temporarily unavailable.");
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).not.toBeNull();
    expect(window.location.search).toBe("?code=auth-code");
  });

  it("clears callback PKCE after the API definitively rejects the exchange", async () => {
    localStorage.setItem(
      PKCE_STORAGE_KEY,
      JSON.stringify({ verifier: "x".repeat(64), redirectType: "sign-in" }),
    );
    window.history.replaceState({}, "", "/library?code=invalid-code");
    const client = trackedClient(
      vi.fn().mockResolvedValue(
        response(
          { error: { message: "The sign-in link is invalid or has expired." } },
          400,
        ),
      ),
    );

    await client.getSession();

    expect(localStorage.getItem(PKCE_STORAGE_KEY)).toBeNull();
  });

  it("refreshes an expired session and requires the same authenticated user", async () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(
        storedSession({
          expires_in: 1,
          expires_at: Math.floor(Date.now() / 1000) - 1,
        }),
      ),
    );
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        data: {
          session: apiSession({
            accessToken: "rotated-access-token",
            refreshToken: "rotated-refresh-token",
          }),
        },
      }),
    );
    const client = trackedClient(fetchMock);

    const result = await client.getSession();

    expect(result.error).toBeNull();
    expect(result.data.session?.access_token).toBe("rotated-access-token");
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/v1/auth/session/refresh`);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      refreshToken: "refresh-token",
    });
  });

  it("migrates a chunked legacy session cookie without exposing it to API requests", async () => {
    const legacy = `base64-${btoa(JSON.stringify(storedSession()))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")}`;
    const midpoint = Math.ceil(legacy.length / 2);
    document.cookie = `sb-auth.0=${legacy.slice(0, midpoint)}; Path=/`;
    document.cookie = `sb-auth.1=${legacy.slice(midpoint)}; Path=/`;
    const fetchMock = vi.fn();
    const client = trackedClient(fetchMock);

    const result = await client.getSession();

    expect(result.data.session?.user.id).toBe(USER_ID);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    expect(document.cookie).not.toContain("sb-auth");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not delete a legacy cookie when it cannot migrate it", async () => {
    document.cookie = "sb-auth=not-valid-json; Path=/";
    const client = trackedClient();

    const result = await client.getSession();

    expect(result.data.session).toBeNull();
    expect(document.cookie).toContain("sb-auth=not-valid-json");
  });

  it("fails closed when another tab writes a malformed session", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    const client = trackedClient();
    await client.getSession();
    const listener = vi.fn();
    client.onAuthStateChange(listener);
    const stop = client.startCrossTabSynchronization();

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SESSION_STORAGE_KEY,
        newValue: JSON.stringify({ user: "invalid" }),
      }),
    );
    await Promise.resolve();

    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(listener).toHaveBeenCalledWith("SIGNED_OUT", null);
    stop();
  });

  it("clears the local session even when server-side logout is unavailable", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    localStorage.setItem(
      PKCE_STORAGE_KEY,
      JSON.stringify({ verifier: "p".repeat(64), redirectType: "sign-in" }),
    );
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    const client = trackedClient(fetchMock);

    const result = await client.signOut();

    expect(result.error?.message).toBe("Authentication is temporarily unavailable.");
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).toBeNull();
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/v1/auth/session/logout`);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer access-token",
    });
  });
});
