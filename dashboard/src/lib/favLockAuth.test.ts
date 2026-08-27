import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FavLockAuthClient, LOCAL_PROFILE_STORAGE_KEY, type AuthSession } from "./favLockAuth";

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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function trackedClient(fetchImplementation = vi.fn()) {
    const client = createClient(fetchImplementation);
    clients.push(client);
    return client;
  }

  function seedUnavailableSession(session = storedSession()) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1,
      user: session.user,
      cloudStatus: "unavailable",
    }));
    localStorage.setItem("local-vault-sentinel", "preserved");
  }

  it("recovers a persisted temporary failure on startup before token expiry", async () => {
    seedUnavailableSession();
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: { session: apiSession({ accessToken: "recovered-token" }) },
    }));
    const client = trackedClient(fetchMock);
    const listener = vi.fn();
    client.onAuthStateChange(listener);

    const results = await Promise.all([client.getSession(), client.getSession()]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/v1/auth/session/refresh`);
    expect(client.getCloudStatus()).toBe("available");
    for (const result of results) {
      expect(result.error).toBeNull();
      expect(result.data.session?.access_token).toBe("recovered-token");
    }
    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).cloudStatus).toBe("available");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
  });

  it("does not refresh a healthy unexpired session at startup", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    const fetchMock = vi.fn();
    const client = trackedClient(fetchMock);
    await client.getSession();
    expect(client.getCloudStatus()).toBe("available");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retains a temporary failure offline and recovers when connectivity returns", async () => {
    vi.useFakeTimers();
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    seedUnavailableSession();
    const fetchMock = vi.fn().mockResolvedValue(response({ data: { session: apiSession() } }));
    const client = trackedClient(fetchMock);
    const stop = client.startCrossTabSynchronization();
    await client.getSession();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(client.getCloudStatus()).toBe("offline");
    expect(fetchMock).not.toHaveBeenCalled();

    online.mockReturnValue(true);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(client.getCloudStatus()).toBe("available");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    stop();
  });

  it("retries failed startup recovery after 30 seconds and clears the startup error", async () => {
    vi.useFakeTimers();
    seedUnavailableSession();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(response({ data: { session: apiSession() } }));
    const client = trackedClient(fetchMock);
    const initial = await client.getSession();
    expect(initial.error?.message).toBe("Authentication is temporarily unavailable.");
    expect(client.getCloudStatus()).toBe("unavailable");
    expect(client.getLocalUser()?.id).toBe(USER_ID);

    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.getCloudStatus()).toBe("available");
    expect((await client.getSession()).error).toBeNull();
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it("bounds startup recovery to eight seconds without dropping the local session", async () => {
    vi.useFakeTimers();
    seedUnavailableSession();
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const client = trackedClient(fetchMock);
    const pending = client.getSession();
    await vi.advanceTimersByTimeAsync(8_000);
    const result = await pending;

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.error?.message).toBe("Authentication is temporarily unavailable.");
    expect(result.data.session?.user.id).toBe(USER_ID);
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
  });

  it.each([
    [401, "reconnect_required"],
    [403, "restricted"],
  ] as const)("stops startup recovery after HTTP %s without signing out", async (status, expected) => {
    vi.useFakeTimers();
    seedUnavailableSession();
    const fetchMock = vi.fn().mockResolvedValue(response({ error: { message: "Cloud access denied." } }, status));
    const client = trackedClient(fetchMock);
    const listener = vi.fn();
    client.onAuthStateChange(listener);
    await client.getSession();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(client.getCloudStatus()).toBe(expected);
    expect(client.getLocalUser()?.id).toBe(USER_ID);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
  });

  it.each(["restricted", "reconnect_required"] as const)("does not automatically recover persisted %s even with an expired token", async (status) => {
    vi.useFakeTimers();
    const session = storedSession({ expires_at: 1 });
    seedUnavailableSession(session);
    localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify({ version: 1, user: session.user, cloudStatus: status }));
    const fetchMock = vi.fn();
    const client = trackedClient(fetchMock);
    await client.getSession();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.getCloudStatus()).toBe(status);
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it("schedules recovery for a transient cloud failure without waiting for expiry or reload", async () => {
    vi.useFakeTimers();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    const fetchMock = vi.fn().mockResolvedValue(response({ data: { session: apiSession() } }));
    const client = trackedClient(fetchMock);
    await client.getSession();
    client.markCloudFailure("access-token", "unavailable");
    await vi.advanceTimersByTimeAsync(30_000);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(client.getCloudStatus()).toBe("available");
  });

  it("recovers startup using a session rotated by another tab", async () => {
    seedUnavailableSession();
    const rotated = storedSession({ access_token: "rotated-access", refresh_token: "rotated-refresh" });
    const fetchMock = vi.fn().mockImplementation(async () => {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(rotated));
      return response({ error: { message: "Session expired." } }, 401);
    });
    const client = trackedClient(fetchMock);
    const result = await client.getSession();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.error).toBeNull();
    expect(result.data.session?.access_token).toBe("rotated-access");
    expect(client.getCloudStatus()).toBe("available");
  });

  it.each(["restricted", "reconnect_required"] as const)("does not let a late temporary failure restart recovery after %s", async (status) => {
    vi.useFakeTimers();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    const fetchMock = vi.fn();
    const client = trackedClient(fetchMock);
    await client.getSession();
    client.markCloudFailure("access-token", "unavailable");
    client.markCloudFailure("access-token", status);
    client.markCloudFailure("access-token", "unavailable");
    await vi.advanceTimersByTimeAsync(120_000);

    expect(client.getCloudStatus()).toBe(status);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.getLocalUser()?.id).toBe(USER_ID);
  });

  it("cancels a pending recovery retry on explicit sign-out", async () => {
    vi.useFakeTimers();
    seedUnavailableSession();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(response({ data: {} }));
    const client = trackedClient(fetchMock);
    await client.getSession();
    await client.signOut();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_URL}/v1/auth/session/logout`);
    expect(client.getLocalUser()).toBeNull();
    expect(client.getCloudStatus()).toBe("signed_out");
    expect((await client.getSession()).error).toBeNull();
  });

  it("migrates an expired existing session offline without contacting Auth", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession({ expires_at: 1 })));
    const fetchMock = vi.fn();
    const client = trackedClient(fetchMock);
    await client.getSession();
    expect(client.getLocalUser()?.id).toBe(USER_ID);
    expect(client.getCloudStatus()).toBe("offline");
    expect(fetchMock).not.toHaveBeenCalled();
    const profile = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!;
    expect(profile).toContain(USER_ID);
    expect(profile).not.toMatch(/access-token|refresh-token|access_token|refresh_token/);
  });

  it("opens the local account after cloud credentials disappear", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    await trackedClient().getSession();
    localStorage.removeItem(SESSION_STORAGE_KEY);
    const client = trackedClient();
    expect((await client.getSession()).data.session).toBeNull();
    expect(client.getLocalUser()?.id).toBe(USER_ID);
    expect(client.getCloudStatus()).toBe("reconnect_required");
  });

  it.each(["restricted", "reconnect_required"] as const)("persists %s without removing the local profile", async (status) => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    const client = trackedClient();
    await client.getSession();
    client.markCloudFailure("access-token", status);
    const restored = trackedClient();
    await restored.getSession();
    expect(restored.getCloudStatus()).toBe(status);
    expect(restored.getLocalUser()?.id).toBe(USER_ID);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
  });

  it("ignores a late denial for a replaced token", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    const client = trackedClient(vi.fn().mockResolvedValue(response({ data: { session: apiSession({ accessToken: "new-token" }) } })));
    await client.getSession();
    await client.retryCloudConnection();
    client.markCloudFailure("access-token", "restricted");
    expect(client.getCloudStatus()).toBe("available");
    expect((await client.getSession()).data.session?.access_token).toBe("new-token");
  });

  it("rejects a recreated account with the same email without replacing the local vault", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    const profile = apiSession().user;
    const client = trackedClient(vi.fn().mockResolvedValue(response({ data: { session: apiSession({ user: { ...profile, id: "22222222-2222-4222-8222-222222222222" } }) } })));
    await client.getSession();
    const result = await client.signInWithPassword({ email: profile.email, password: "password", options: { captchaToken: "captcha" } });
    expect(result.error?.message).toContain("different account");
    expect(client.getLocalUser()?.id).toBe(USER_ID);
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).user.id).toBe(USER_ID);
  });

  it("reconnects the same account without clearing local storage", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    localStorage.setItem("local-vault-sentinel", "preserved");
    const client = trackedClient(vi.fn().mockResolvedValue(response({ data: { session: apiSession() } })));
    await client.getSession();
    client.markCloudFailure("access-token", "reconnect_required");
    const result = await client.signInWithPassword({ email: "ada@example.com", password: "password", options: { captchaToken: "captcha" } });
    expect(result.error).toBeNull();
    expect(client.getCloudStatus()).toBe("available");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it("does not resurrect a session when refresh finishes after explicit sign-out", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    let finishRefresh!: (value: Response) => void;
    const fetchMock = vi.fn().mockImplementation((url: string) => url.endsWith("/refresh")
      ? new Promise<Response>((resolve) => { finishRefresh = resolve; })
      : Promise.resolve(response({ data: {} })));
    const client = trackedClient(fetchMock);
    await client.getSession();
    const refresh = client.retryCloudConnection();
    const rejected = expect(refresh).rejects.toThrow();
    await vi.waitFor(() => expect(finishRefresh).toBeTypeOf("function"));
    await client.signOut();
    finishRefresh(response({ data: { session: apiSession() } }));
    await rejected;
    expect((await client.getSession()).data.session).toBeNull();
    expect(client.getLocalUser()).toBeNull();
    expect(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)).toBeNull();
  });

  it("does not resurrect a late password sign-in after explicit sign-out", async () => {
    let finish!: (value: Response) => void;
    const client = trackedClient(vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const signIn = client.signInWithPassword({ email: "ada@example.com", password: "password", options: { captchaToken: "captcha" } });
    await client.signOut();
    finish(response({ data: { session: apiSession() } }));
    expect((await signIn).error?.message).toContain("cancelled");
    expect(client.getLocalUser()).toBeNull();
  });

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

  it("preserves an expired session when refresh is temporarily unavailable", async () => {
    const expiredSession = storedSession({
      expires_in: 1,
      expires_at: Math.floor(Date.now() / 1000) - 1,
    });
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(expiredSession));
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    const client = trackedClient(fetchMock);
    const listener = vi.fn();
    client.onAuthStateChange(listener);

    const result = await client.getSession();
    await Promise.resolve();

    expect(result.error?.message).toBe("Authentication is temporarily unavailable.");
    expect(result.data.session?.user.id).toBe(USER_ID);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    expect(listener).toHaveBeenCalledWith(
      "INITIAL_SESSION",
      expect.objectContaining({ refresh_token: "refresh-token" }),
    );
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
  });

  it("keeps an expired session available offline when refresh credentials are rejected", async () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(
        storedSession({
          expires_in: 1,
          expires_at: Math.floor(Date.now() / 1000) - 1,
        }),
      ),
    );
    const client = trackedClient(
      vi.fn().mockResolvedValue(
        response(
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
    const listener = vi.fn();
    client.onAuthStateChange(listener);

    const result = await client.getSession();
    await Promise.resolve();

    expect(result.data.session?.user.id).toBe(USER_ID);
    expect(result.error?.message).toBe("Your session has expired. Sign in again.");
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    expect(listener).toHaveBeenCalledWith(
      "SESSION_STALE",
      expect.objectContaining({ refresh_token: "refresh-token" }),
    );
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
  });

  it("uses a session rotated by another tab after refresh credentials are rejected", async () => {
    const expiredSession = storedSession({
      expires_in: 1,
      expires_at: Math.floor(Date.now() / 1000) - 1,
    });
    const rotatedSession = storedSession({
      access_token: "rotated-access-token",
      refresh_token: "rotated-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(expiredSession));
    const fetchMock = vi.fn().mockImplementation(async () => {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(rotatedSession));
      return response(
        {
          error: {
            code: "session_expired",
            message: "Your session has expired. Sign in again.",
          },
        },
        401,
      );
    });
    const client = trackedClient(fetchMock);

    const result = await client.getSession();

    expect(result.error).toBeNull();
    expect(result.data.session?.access_token).toBe("rotated-access-token");
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toContain(
      "rotated-refresh-token",
    );
  });

  it("does not sign out after a scheduled refresh fails temporarily", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(
        storedSession({
          expires_in: 61,
          expires_at: Math.floor(Date.now() / 1000) + 61,
        }),
      ),
    );
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    const client = trackedClient(fetchMock);
    const listener = vi.fn();
    client.onAuthStateChange(listener);
    await client.getSession();
    await Promise.resolve();
    listener.mockClear();

    await vi.advanceTimersByTimeAsync(65_000);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
  });

  it("keeps the local session after a scheduled refresh is rejected", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(
        storedSession({
          expires_in: 61,
          expires_at: Math.floor(Date.now() / 1000) + 61,
        }),
      ),
    );
    const fetchMock = vi.fn().mockResolvedValue(
      response(
        {
          error: {
            code: "session_expired",
            message: "Your session has expired. Sign in again.",
          },
        },
        401,
      ),
    );
    const client = trackedClient(fetchMock);
    const listener = vi.fn();
    client.onAuthStateChange(listener);
    await client.getSession();
    await Promise.resolve();
    listener.mockClear();

    await vi.advanceTimersByTimeAsync(65_000);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    expect(listener).toHaveBeenCalledWith(
      "SESSION_STALE",
      expect.objectContaining({ refresh_token: "refresh-token" }),
    );
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
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
    expect(listener).toHaveBeenCalledWith("SESSION_STALE", null);
    expect(client.getLocalUser()?.id).toBe(USER_ID);
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
