import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FavLockAuthClient, LOCAL_PROFILE_STORAGE_KEY, type AuthSession } from "./favLockAuth";
import { CloudAccessError } from "./cloudAccess";
import { startLocalVaultCloudMerge } from "./localVaultCloudMerge";

const API_URL = "https://api.favlock.example";
const AUTH_URL = "https://auth.favlock.example";
const DASHBOARD_URL = "https://dashboard.favlock.example";
const SESSION_STORAGE_KEY = "favlock.auth.session.v1";
const PKCE_STORAGE_KEY = "favlock.auth.pkce.v1";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_SESSION_ID = "44444444-4444-4444-8444-444444444444";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeAccessToken(claims: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) => btoa(JSON.stringify(value))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.fake-test-signature`;
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
    vi.unstubAllGlobals();
  });

  function trackedClient(fetchImplementation = vi.fn()) {
    const client = createClient(fetchImplementation);
    clients.push(client);
    return client;
  }

  it("creates and restores a token-free local account without network access", async () => {
    const fetchImplementation = vi.fn();
    const client = trackedClient(fetchImplementation);

    const result = await client.createLocalAccount();

    expect(result.error).toBeNull();
    expect(result.data.user).toMatchObject({
      email: "",
      local_only: true,
    });
    expect(client.getLocalUser()?.id).toBe(result.data.user?.id);
    expect(client.getCloudStatus()).toBe("reconnect_required");
    expect(fetchImplementation).not.toHaveBeenCalled();

    const restored = trackedClient(fetchImplementation);
    await restored.initialize();
    expect(restored.getLocalUser()).toMatchObject({
      id: result.data.user?.id,
      local_only: true,
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

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

  it("renews an expired session on demand after timers were suspended overnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T20:00:00.000Z"));
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    localStorage.setItem("local-vault-sentinel", "preserved");
    const fetchMock = vi.fn().mockImplementation(async () => response({
      data: { session: apiSession({ accessToken: "resumed-access", refreshToken: "resumed-refresh" }) },
    }));
    const client = trackedClient(fetchMock);
    const listener = vi.fn();
    client.onAuthStateChange(listener);
    await client.getSession();

    // Advancing the clock without running timers models a suspended browser.
    vi.setSystemTime(new Date("2026-08-28T08:00:00.000Z"));
    const results = await Promise.all([client.getSession(), client.getSession(), client.getSession()]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/v1/auth/session/refresh`);
    for (const result of results) {
      expect(result.error).toBeNull();
      expect(result.data.session?.access_token).toBe("resumed-access");
      expect(result.data.session!.expires_at * 1000).toBeGreaterThan(Date.now());
    }
    expect(client.getCloudStatus()).toBe("available");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
  });

  it.each(["focus", "visibilitychange", "pageshow"] as const)(
    "silently renews an expired session on %s without a network transition",
    async (eventName) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-27T20:00:00.000Z"));
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
      const fetchMock = vi.fn().mockImplementation(async () => response({
        data: { session: apiSession({ accessToken: "wake-access", refreshToken: "wake-refresh" }) },
      }));
      const client = trackedClient(fetchMock);
      const stop = client.startCrossTabSynchronization();
      await client.getSession();
      vi.setSystemTime(new Date("2026-08-28T08:00:00.000Z"));

      const target = eventName === "visibilitychange" ? document : window;
      target.dispatchEvent(new Event(eventName));
      await vi.advanceTimersByTimeAsync(0);

      // Assert the event itself started recovery, not a subsequent getSession().
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(client.getCloudStatus()).toBe("available");
      expect((await client.getSession()).data.session?.access_token).toBe("wake-access");
      stop();
    },
  );

  it("does not rotate a healthy session for repeated wake events", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    const fetchMock = vi.fn();
    const client = trackedClient(fetchMock);
    const stop = client.startCrossTabSynchronization();
    await client.getSession();

    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pageshow"));
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.getCloudStatus()).toBe("available");
    stop();
  });

  it("does not refresh on a hidden visibility change or while offline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T20:00:00.000Z"));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    const fetchMock = vi.fn();
    const client = trackedClient(fetchMock);
    const stop = client.startCrossTabSynchronization();
    await client.getSession();
    vi.setSystemTime(new Date("2026-08-28T08:00:00.000Z"));

    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    online.mockReturnValue(false);
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pageshow"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.getCloudStatus()).toBe("offline");
    expect(client.getLocalUser()?.id).toBe(USER_ID);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    stop();
  });

  it("shares one token rotation between clients waiting for the same browser lock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T20:00:00.000Z"));
    let queue = Promise.resolve();
    const request = vi.fn((_name: string, _options: unknown, callback: () => Promise<AuthSession>) => {
      const result = queue.then(callback);
      queue = result.then(() => undefined, () => undefined);
      return result;
    });
    vi.stubGlobal("navigator", new Proxy(navigator, {
      get(target, property) {
        return property === "locks" ? { request } : Reflect.get(target, property, target);
      },
    }));
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    const fetchMock = vi.fn().mockImplementation(async () => response({
      data: { session: apiSession({ accessToken: "shared-access", refreshToken: "shared-refresh" }) },
    }));
    const first = trackedClient(fetchMock);
    const second = trackedClient(fetchMock);
    await Promise.all([first.getSession(), second.getSession()]);
    vi.setSystemTime(new Date("2026-08-28T08:00:00.000Z"));

    const results = await Promise.all([first.getSession(), second.getSession()]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalled();
    for (const result of results) {
      expect(result.error).toBeNull();
      expect(result.data.session?.access_token).toBe("shared-access");
    }
    expect(first.getCloudStatus()).toBe("available");
    expect(second.getCloudStatus()).toBe("available");
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
    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).refreshRejected === true).toBe(status === 401);
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
  });

  it.each(["restricted", "reconnect_required"] as const)("does not automatically recover persisted %s even with an expired token", async (status) => {
    vi.useFakeTimers();
    const session = storedSession({ expires_at: 1 });
    seedUnavailableSession(session);
    localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1, user: session.user, cloudStatus: status, refreshRejected: status === "reconnect_required",
    }));
    const fetchMock = vi.fn();
    const client = trackedClient(fetchMock);
    await client.getSession();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.getCloudStatus()).toBe(status);
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it.each([false, true])("silently recovers a legacy reconnect marker (expired token: %s)", async (expired) => {
    const session = storedSession(expired ? { expires_at: 1 } : {});
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1, user: session.user, cloudStatus: "reconnect_required",
    }));
    localStorage.setItem("local-vault-sentinel", "preserved");
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: { session: apiSession({ accessToken: "recovered-access", refreshToken: "recovered-refresh" }) },
    }));
    const client = trackedClient(fetchMock);

    const results = await Promise.all([client.getSession(), client.getSession()]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(client.getCloudStatus()).toBe("available");
    for (const result of results) {
      expect(result.error).toBeNull();
      expect(result.data.session?.access_token).toBe("recovered-access");
    }
    const profile = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!;
    expect(JSON.parse(profile).refreshRejected).not.toBe(true);
    expect(profile).not.toMatch(/access_token|refresh_token|recovered-access|recovered-refresh/);
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it("does not retry a server-rejected refresh after reload or wake", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    seedUnavailableSession();
    const rejectedFetch = vi.fn().mockResolvedValue(response({ error: { message: "Session rejected." } }, 401));
    const first = trackedClient(rejectedFetch);
    await first.getSession();
    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).refreshRejected).toBe(true);
    first.dispose();

    const fetchMock = vi.fn();
    const restored = trackedClient(fetchMock);
    const stop = restored.startCrossTabSynchronization();
    await restored.getSession();
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pageshow"));
    await vi.advanceTimersByTimeAsync(120_000);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(restored.getCloudStatus()).toBe("reconnect_required");
    expect(restored.getLocalUser()?.id).toBe(USER_ID);
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    stop();
  });

  it("does not label an ordinary data denial as rejected refresh credentials", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    const client = trackedClient();
    await client.getSession();

    client.markCloudFailure("access-token", "reconnect_required");

    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).refreshRejected).not.toBe(true);
  });

  it("does not mark a malformed successful refresh response as a server-rejected credential", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    const client = trackedClient(vi.fn().mockResolvedValue(response({ data: { session: { invalid: true } } })));
    const context = await client.getRequestSession("access-token");

    await expect(client.refreshRequestSession(context)).rejects.toBeInstanceOf(CloudAccessError);

    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).refreshRejected).not.toBe(true);
    expect(client.getLocalUser()?.id).toBe(USER_ID);
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).refresh_token).toBe("refresh-token");
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
    if (status === "reconnect_required") {
      const profile = JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!);
      localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify({ ...profile, refreshRejected: true }));
    }
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

  it("switches from a local vault only after an explicit merge intent", async () => {
    const cloudUserId = "22222222-2222-4222-8222-222222222222";
    const client = trackedClient(vi.fn().mockResolvedValue(response({
      data: { session: apiSession({ user: { ...apiSession().user, id: cloudUserId } }) },
    })));
    const created = await client.createLocalAccount();
    const localUserId = created.data.user!.id;
    localStorage.setItem("local-vault-sentinel", "preserved");
    startLocalVaultCloudMerge(localUserId);

    const result = await client.signInWithPassword({
      email: "ada@example.com",
      password: "password",
      options: { captchaToken: "captcha" },
    });

    expect(result.error).toBeNull();
    expect(client.getLocalUser()?.id).toBe(cloudUserId);
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
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

  it("does not surface an old refresh 401 when a same-account sign-in completes alongside it", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
    localStorage.setItem("local-vault-sentinel", "preserved");
    const refreshResponse = deferredResponse();
    const loginResponse = deferredResponse();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/refresh")) return refreshResponse.promise;
      if (url.endsWith("/sign-in/password")) return loginResponse.promise;
      throw new Error("Unexpected authentication request.");
    });
    const client = trackedClient(fetchMock);
    await client.getSession();
    const retry = client.retryCloudConnection().then(() => null, (error: unknown) => error);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signIn = client.signInWithPassword({
      email: "ada@example.com", password: "password", options: { captchaToken: "captcha" },
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // Keep both resolutions in one turn: the refresh catch sees the old token
    // before the login saves, but the outer failure handler runs afterwards.
    refreshResponse.resolve(response({ error: { message: "Your session has expired. Sign in again." } }, 401));
    loginResponse.resolve(response({
      data: { session: apiSession({ accessToken: "signed-in-access", refreshToken: "signed-in-refresh" }) },
    }));

    expect((await signIn).error).toBeNull();
    expect(await retry).toBeNull();
    expect(client.getCloudStatus()).toBe("available");
    expect((await client.getSession()).data.session?.access_token).toBe("signed-in-access");
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).refresh_token).toBe("signed-in-refresh");
    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).cloudStatus).toBe("available");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  describe.each([false, true])("refresh completion after sign-in (explicit sign-out first: %s)", (signOutFirst) => {
    it.each(["401", "403", "temporary", "success"] as const)(
      "keeps the newer same-account login after the old refresh returns %s",
      async (outcome) => {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
        const refreshResponse = deferredResponse();
        const fetchMock = vi.fn().mockImplementation((url: string) => {
          if (url.endsWith("/refresh")) return refreshResponse.promise;
          if (url.endsWith("/logout")) return Promise.resolve(response({ data: {} }));
          if (url.endsWith("/sign-in/password")) return Promise.resolve(response({
            data: { session: apiSession({ accessToken: "signed-in-access", refreshToken: "signed-in-refresh" }) },
          }));
          throw new Error("Unexpected authentication request.");
        });
        const client = trackedClient(fetchMock);
        await client.getSession();
        const retry = client.retryCloudConnection().then(() => null, (error: unknown) => error);
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
        if (signOutFirst) await client.signOut();
        const signIn = await client.signInWithPassword({
          email: "ada@example.com", password: "password", options: { captchaToken: "captcha" },
        });
        expect(signIn.error).toBeNull();
        expect(client.getCloudStatus()).toBe("available");

        if (outcome === "temporary") {
          refreshResponse.reject(new TypeError("Network unavailable for the old refresh."));
        } else if (outcome === "success") {
          refreshResponse.resolve(response({
            data: { session: apiSession({ accessToken: "old-rotated-access", refreshToken: "old-rotated-refresh" }) },
          }));
        } else {
          refreshResponse.resolve(response({ error: { message: "Old session was rejected." } }, Number(outcome)));
        }

        expect(await retry).toBeNull();
        expect(client.getCloudStatus()).toBe("available");
        const current = await client.getSession();
        expect(current.error).toBeNull();
        expect(current.data.session?.access_token).toBe("signed-in-access");
        expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).refresh_token).toBe("signed-in-refresh");
        expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).cloudStatus).toBe("available");
      },
    );
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

  describe("request sessions", () => {
    it("renews near-expiry credentials once before concurrent requests", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-28T08:00:00.000Z"));
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
      const fetchMock = vi.fn().mockImplementation(async () => response({
        data: { session: apiSession({ accessToken: "request-access", refreshToken: "request-refresh" }) },
      }));
      const client = trackedClient(fetchMock);
      await client.getSession();
      vi.setSystemTime(new Date("2026-08-28T08:59:05.000Z"));

      const requests = await Promise.all([
        client.getRequestSession("access-token"), client.getRequestSession("access-token"),
      ]);

      expect(fetchMock).toHaveBeenCalledOnce();
      for (const request of requests) {
        expect(request).toEqual({ accessToken: "request-access", userId: USER_ID, generation: expect.any(Number) });
        expect(client.isRequestSessionCurrent(request)).toBe(true);
      }
      expect(requests[0].generation).toBe(requests[1].generation);
    });

    it("shares a rejected-token refresh and reuses it for later 401 responses", async () => {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
      const refreshResponse = deferredResponse();
      const fetchMock = vi.fn().mockReturnValue(refreshResponse.promise);
      const client = trackedClient(fetchMock);
      const original = await client.getRequestSession("access-token");
      const pending = Promise.all([
        client.refreshRequestSession(original), client.refreshRequestSession(original),
      ]);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      refreshResponse.resolve(response({
        data: { session: apiSession({ accessToken: "rotated-access", refreshToken: "rotated-refresh" }) },
      }));

      const refreshed = await pending;
      const lateResponse = await client.refreshRequestSession(original);

      expect(fetchMock).toHaveBeenCalledOnce();
      for (const request of [...refreshed, lateResponse]) {
        expect(request.accessToken).toBe("rotated-access");
        expect(request.generation).toBe(original.generation);
        expect(client.isRequestSessionCurrent(request)).toBe(true);
      }
      expect(client.isRequestSessionCurrent(original)).toBe(true);
    });

    it.each([
      { label: "a same-account sign-in", signOutFirst: false, nextUserId: USER_ID },
      { label: "sign-out and same-account sign-in", signOutFirst: true, nextUserId: USER_ID },
      { label: "sign-out and different-account sign-in", signOutFirst: true, nextUserId: OTHER_USER_ID },
    ])("invalidates old request work after $label", async ({ signOutFirst, nextUserId }) => {
      const originalToken = fakeAccessToken({ sub: USER_ID, session_id: SESSION_ID });
      const nextToken = fakeAccessToken({ sub: nextUserId, session_id: OTHER_SESSION_ID });
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession({ access_token: originalToken })));
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("/logout")) return Promise.resolve(response({ data: {} }));
        if (url.endsWith("/sign-in/password")) return Promise.resolve(response({
          data: { session: apiSession({
            accessToken: nextToken, refreshToken: "new-login-refresh",
            user: { ...apiSession().user, id: nextUserId },
          }) },
        }));
        throw new Error("Stale request work must not start a refresh.");
      });
      const client = trackedClient(fetchMock);
      const original = await client.getRequestSession(originalToken);
      if (signOutFirst) await client.signOut();
      const login = await client.signInWithPassword({
        email: "ada@example.com", password: "password", options: { captchaToken: "captcha" },
      });
      expect(login.error).toBeNull();

      expect(client.isRequestSessionCurrent(original)).toBe(false);
      await expect(client.refreshRequestSession(original)).rejects.toBeInstanceOf(Error);
      await expect(client.getRequestSession(originalToken)).rejects.toBeInstanceOf(Error);
      const current = await client.getRequestSession(nextToken);

      expect(current.userId).toBe(nextUserId);
      expect(current.accessToken).toBe(nextToken);
      expect(current.generation).not.toBe(original.generation);
      expect(client.isRequestSessionCurrent(current)).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(signOutFirst ? 2 : 1);
      expect(client.getCloudStatus()).toBe("available");
    });

    it("keeps a long-running sync closure bound to its JWT session through many token rotations", async () => {
      const initialToken = fakeAccessToken({ sub: USER_ID, session_id: SESSION_ID, revision: 0 });
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession({ access_token: initialToken })));
      const fetchMock = vi.fn();
      const client = trackedClient(fetchMock);
      const initial = await client.getRequestSession(initialToken);
      const stop = client.startCrossTabSynchronization();
      let currentToken = initialToken;

      for (let revision = 1; revision <= 16; revision += 1) {
        currentToken = fakeAccessToken({ sub: USER_ID, session_id: SESSION_ID, revision });
        const stored = JSON.stringify(storedSession({
          access_token: currentToken, refresh_token: `rotated-refresh-${revision}`,
        }));
        localStorage.setItem(SESSION_STORAGE_KEY, stored);
        window.dispatchEvent(new StorageEvent("storage", { key: SESSION_STORAGE_KEY, newValue: stored }));
        await client.getSession();
      }

      const request = await client.getRequestSession(initialToken);

      expect(request.accessToken).toBe(currentToken);
      expect(request.generation).toBe(initial.generation);
      expect(client.isRequestSessionCurrent(initial)).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
      stop();
    });

    it.each([
      ["another user", fakeAccessToken({ sub: OTHER_USER_ID, session_id: SESSION_ID })],
      ["another session", fakeAccessToken({ sub: USER_ID, session_id: OTHER_SESSION_ID })],
      ["a missing session id", fakeAccessToken({ sub: USER_ID })],
      ["a malformed token", "not-a-jwt"],
      ["an empty token", ""],
    ])("rejects a caller from %s without substituting the current credentials", async (_label, callerToken) => {
      const currentToken = fakeAccessToken({ sub: USER_ID, session_id: SESSION_ID });
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession({ access_token: currentToken })));
      const fetchMock = vi.fn();
      const client = trackedClient(fetchMock);
      const current = await client.getRequestSession(currentToken);

      await expect(client.getRequestSession(callerToken)).rejects.toBeInstanceOf(Error);

      expect(client.isRequestSessionCurrent({ ...current, accessToken: callerToken })).toBe(false);
      expect(client.isRequestSessionCurrent(current)).toBe(true);
      expect(client.getCloudStatus()).toBe("available");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      [401, "reconnect_required"], [403, "restricted"], [503, "unavailable"],
    ] as const)("returns a typed cloud failure after refresh HTTP %s without clearing local data", async (status, code) => {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession()));
      localStorage.setItem("local-vault-sentinel", "preserved");
      const fetchMock = vi.fn().mockResolvedValue(response({ error: { message: "Refresh request failed." } }, status));
      const client = trackedClient(fetchMock);
      const original = await client.getRequestSession("access-token");

      const result = client.refreshRequestSession(original);
      await expect(result).rejects.toBeInstanceOf(CloudAccessError);
      await expect(result).rejects.toMatchObject({ code });

      expect(client.getLocalUser()?.id).toBe(USER_ID);
      expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
      expect((await client.getSession()).data.session?.refresh_token).toBe("refresh-token");
      expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).refreshRejected === true).toBe(status === 401);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("returns unavailable for offline requests while retaining the local session", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession({ expires_at: 1 })));
      const fetchMock = vi.fn();
      const client = trackedClient(fetchMock);

      await expect(client.getRequestSession("access-token")).rejects.toMatchObject({ code: "unavailable" });

      expect((await client.getSession()).data.session?.refresh_token).toBe("refresh-token");
      expect(client.getLocalUser()?.id).toBe(USER_ID);
      expect(client.getCloudStatus()).toBe("offline");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("clears refresh rejection only after a successful same-account sign-in", async () => {
      const session = storedSession();
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify({
        version: 1, user: session.user, cloudStatus: "reconnect_required", refreshRejected: true,
      }));
      const fetchMock = vi.fn().mockResolvedValue(response({
        data: { session: apiSession({ accessToken: "signed-in-access", refreshToken: "signed-in-refresh" }) },
      }));
      const client = trackedClient(fetchMock);
      await expect(client.getRequestSession("access-token")).rejects.toMatchObject({ code: "reconnect_required" });
      expect(fetchMock).not.toHaveBeenCalled();

      const login = await client.signInWithPassword({
        email: "ada@example.com", password: "password", options: { captchaToken: "captcha" },
      });

      expect(login.error).toBeNull();
      expect((await client.getRequestSession("signed-in-access")).accessToken).toBe("signed-in-access");
      expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).refreshRejected).not.toBe(true);
      expect(client.getCloudStatus()).toBe("available");
      expect(fetchMock).toHaveBeenCalledOnce();
    });
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

  it.each([undefined, {}, { first_name: " ", last_name: "" }])("omits absent or blank signup names and retains confirmation PKCE (%#)", async (data) => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: { confirmationRequired: true, session: null } }));
    const client = trackedClient(fetchMock);
    const result = await client.signUp({
      email: "ada@example.com", password: "fake-test-password",
      options: { captchaToken: "fake-captcha", emailRedirectTo: `${DASHBOARD_URL}/checkout`, data },
    });
    expect(result.error).toBeNull();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/v1/auth/sign-up`);
    const body = JSON.parse(options.body);
    expect(body).not.toHaveProperty("firstName");
    expect(body).not.toHaveProperty("lastName");
    expect(body).toMatchObject({ captchaToken: "fake-captcha", redirectTarget: "/checkout", pkceCodeChallengeMethod: "s256" });
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("retains confirmation PKCE after an interrupted nameless signup without creating a session", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const client = trackedClient(fetchMock);
    const result = await client.signUp({
      email: "ada@example.com", password: "fake-test-password",
      options: { captchaToken: "fake-captcha", emailRedirectTo: `${DASHBOARD_URL}/checkout` },
    });
    expect(result.error).not.toBeNull();
    expect(result.data).toEqual({ user: null, session: null });
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not alter an existing local account when a signup is attempted", async () => {
    const existing = storedSession();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(existing));
    const fetchMock = vi.fn();
    const client = trackedClient(fetchMock);
    const result = await client.signUp({
      email: "new@example.com", password: "fake-test-password",
      options: { captchaToken: "fake-captcha", emailRedirectTo: `${DASHBOARD_URL}/` },
    });
    expect(result.error?.message).toContain("Reconnect to your existing account");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!)).toEqual(existing);
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).toBeNull();
  });

  it.each([
    [400, "captcha_failed"], [400, "password_rejected"], [400, "email_rejected"],
    [400, "invalid_request"], [429, "rate_limited"],
  ])("leaves no session after rejected signup (%s/%s)", async (status, code) => {
    const fetchMock = vi.fn().mockResolvedValue(response({ error: { code, message: "Safe signup failure." } }, status));
    const client = trackedClient(fetchMock);
    const result = await client.signUp({
      email: "ada@example.com", password: "fake-test-password",
      options: { captchaToken: "fake-captcha", emailRedirectTo: `${DASHBOARD_URL}/` },
    });
    expect(result.error?.message).toBe("Safe signup failure.");
    expect(result.data).toEqual({ user: null, session: null });
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(["google", "email"] as const)("returns a %s signup attempt to checkout after a reload using the existing PKCE flow", async (method) => {
    window.history.replaceState({}, "", "/login?mode=sign-up&next=%2Fcheckout");
    const start = trackedClient(vi.fn().mockResolvedValue(response({ data: { confirmationRequired: true, session: null } }, 202)));
    const result = method === "google"
      ? await start.signInWithOAuth({ provider: "google", options: { redirectTo: `${DASHBOARD_URL}/checkout` } })
      : await start.signUp({ email: "ada@example.com", password: "fake-test-password", options: {
        captchaToken: "fake-captcha", emailRedirectTo: `${DASHBOARD_URL}/checkout`,
      } });
    expect(result.error).toBeNull();
    const pkce = JSON.parse(localStorage.getItem(PKCE_STORAGE_KEY)!);
    start.dispose();

    window.history.replaceState({}, "", "/checkout?code=fake-return-code");
    const fetchMock = vi.fn().mockResolvedValue(response({ data: { session: apiSession() } }));
    const returned = trackedClient(fetchMock);
    const listener = vi.fn();
    returned.onAuthStateChange(listener);
    expect((await returned.getSession()).error).toBeNull();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ authCode: "fake-return-code", codeVerifier: pkce.verifier });
    expect(window.location.pathname).toBe("/checkout");
    expect(window.location.search).toBe("");
    expect(returned.getCloudStatus()).toBe("available");
    await returned.getSession();
    expect(listener.mock.calls.filter(([event]) => event === "SIGNED_IN")).toHaveLength(1);
    expect(listener).not.toHaveBeenCalledWith("PASSWORD_RECOVERY", expect.anything());
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).toBeNull();
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

  it("keeps the latest verifier but removes a rejected callback code", async () => {
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

    expect(localStorage.getItem(PKCE_STORAGE_KEY)).not.toBeNull();
    expect(window.location.search).toBe("");
    expect(client.getCallbackFailure()).toBe("invalid_link");
  });

  it.each([
    ["#error=access_denied&error_description=private-provider-message", "cancelled"],
    ["#error=server_error&error_description=private-provider-message", "provider_error"],
    ["?error_code=otp_expired&error_description=private-provider-message", "invalid_link"],
    ["#error_description=Disposable%20email%20addresses%20are%20not%20allowed%20private-provider-message", "email_rejected"],
    ["#access_token=fake-token&refresh_token=fake-refresh", "unsupported_callback"],
    ["?code=one&code=two", "invalid_link"],
    ["?code=fake-code", "missing_state"],
  ])("handles callback %s without exchanging or reflecting provider text", async (suffix, failure) => {
    window.history.replaceState({}, "", `/checkout${suffix}`);
    const fetchMock = vi.fn();
    const client = trackedClient(fetchMock);
    const result = await client.getSession();
    expect(result.data.session).toBeNull();
    expect(result.error?.message).not.toContain("private-provider-message");
    expect(client.getCallbackFailure()).toBe(failure);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/checkout");
    expect(window.location.search + window.location.hash).toBe("");
  });

  it("retains the original callback and verifier when exchange is rate limited", async () => {
    localStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify({ verifier: "v".repeat(64), redirectType: "sign-in" }));
    window.history.replaceState({}, "", "/checkout?code=fake-code");
    const fetchMock = vi.fn().mockResolvedValue(response({ error: { code: "rate_limited", message: "Wait and try again." } }, 429));
    const client = trackedClient(fetchMock);
    await client.getSession();
    expect(client.getCallbackFailure()).toBe("temporarily_unavailable");
    expect(window.location.search).toBe("?code=fake-code");
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it.each([400, 429])("restores the previous verifier after a rejected resend (%s)", async (status) => {
    const previous = { verifier: "v".repeat(64), redirectType: "sign-in", localAccountEpoch: null };
    localStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify(previous));
    const client = trackedClient(vi.fn().mockResolvedValue(response({ error: { code: "rate_limited", message: "Try later." } }, status)));
    const result = await client.resend({ type: "signup", email: "ada@example.com", options: { captchaToken: "fake-captcha", emailRedirectTo: `${DASHBOARD_URL}/checkout` } });
    expect(result.error).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(PKCE_STORAGE_KEY)!)).toEqual(previous);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("exchanges the new confirmation after a successful resend with its matching verifier", async () => {
    const previous = { verifier: "v".repeat(64), redirectType: "sign-in", localAccountEpoch: null };
    localStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify(previous));
    const start = trackedClient(vi.fn().mockResolvedValue(response({ data: { accepted: true } }, 202)));
    expect((await start.resend({ type: "signup", email: "ada@example.com", options: { captchaToken: "fake-captcha", emailRedirectTo: `${DASHBOARD_URL}/checkout` } })).error).toBeNull();
    const next = JSON.parse(localStorage.getItem(PKCE_STORAGE_KEY)!);
    expect(next.verifier).not.toBe(previous.verifier);
    start.dispose();
    window.history.replaceState({}, "", "/checkout?code=resent-code");
    const exchange = vi.fn().mockResolvedValue(response({ data: { session: apiSession() } }));
    const returned = trackedClient(exchange);
    expect((await returned.getSession()).error).toBeNull();
    expect(JSON.parse(exchange.mock.calls[0][1].body)).toEqual({ authCode: "resent-code", codeVerifier: next.verifier });
    expect(returned.getCloudStatus()).toBe("available");
    expect(window.location.pathname).toBe("/checkout");
  });

  it("keeps the resend verifier when delivery may have succeeded despite a network interruption", async () => {
    localStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify({ verifier: "v".repeat(64), redirectType: "sign-in" }));
    const client = trackedClient(vi.fn().mockRejectedValue(new TypeError("offline")));
    const result = await client.resend({ type: "signup", email: "ada@example.com", options: { captchaToken: "fake-captcha", emailRedirectTo: `${DASHBOARD_URL}/checkout` } });
    expect(result.error).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(PKCE_STORAGE_KEY)!).verifier).not.toBe("v".repeat(64));
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("does not roll back a newer OAuth verifier when an earlier resend fails", async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    const client = trackedClient(fetchMock);
    const resend = client.resend({ type: "signup", email: "ada@example.com", options: { captchaToken: "fake-captcha", emailRedirectTo: `${DASHBOARD_URL}/checkout` } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await client.signInWithOAuth({ provider: "google", options: { redirectTo: `${DASHBOARD_URL}/checkout` } });
    const newer = localStorage.getItem(PKCE_STORAGE_KEY);
    pending.resolve(response({ error: { message: "Too many requests." } }, 429));
    await resend;
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).toBe(newer);
  });

  it("does not accept an old in-flight callback after a new OAuth attempt", async () => {
    localStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify({ verifier: "v".repeat(64), redirectType: "sign-in" }));
    window.history.replaceState({}, "", "/checkout?code=old-code");
    const pending = deferredResponse();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    const client = trackedClient(fetchMock);
    const initialization = client.getSession();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await client.signInWithOAuth({ provider: "google", options: { redirectTo: `${DASHBOARD_URL}/checkout` } });
    const newer = localStorage.getItem(PKCE_STORAGE_KEY);
    pending.resolve(response({ data: { session: apiSession() } }));
    expect((await initialization).data.session).toBeNull();
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).toBe(newer);
    expect(client.getCallbackFailure()).toBe("account_changed");
  });

  it("does not treat an inconsistent signup response as a usable account", async () => {
    const client = trackedClient(vi.fn().mockResolvedValue(response({ data: { confirmationRequired: true, session: apiSession() } })));
    const result = await client.signUp({ email: "ada@example.com", password: "fake-password", options: { captchaToken: "fake-captcha", emailRedirectTo: `${DASHBOARD_URL}/checkout` } });
    expect(result.error).not.toBeNull();
    expect(result.data.session).toBeNull();
    expect(client.getLocalUser()).toBeNull();
  });

  it("does not publish an immediate signup session after another tab signs out", async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    const client = trackedClient(fetchMock);
    const signup = client.signUp({ email: "ada@example.com", password: "fake-password", options: { captchaToken: "fake-captcha", emailRedirectTo: `${DASHBOARD_URL}/checkout` } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    localStorage.setItem("favlock.local-account-epoch.v1", JSON.stringify({ id: crypto.randomUUID(), signedOut: true }));
    pending.resolve(response({ data: { confirmationRequired: false, session: apiSession() } }));
    expect((await signup).data.session).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
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

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ user: "invalid" }));
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
