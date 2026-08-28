import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FavLockAuthClient, LOCAL_PROFILE_STORAGE_KEY, type AuthSession } from "./favLockAuth";
import { CloudAccessError } from "./cloudAccess";

const SESSION_STORAGE_KEY = "favlock.auth.session.v1";
const PKCE_STORAGE_KEY = "favlock.auth.pkce.v1";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const clients: FavLockAuthClient[] = [];
const stops: Array<() => void> = [];

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function apiSession(userId = USER_ID, prefix = "fresh") {
  return {
    accessToken: `${prefix}-access`, refreshToken: `${prefix}-refresh`,
    expiresAt: Math.floor(Date.now() / 1000) + 3600, expiresIn: 3600,
    user: {
      id: userId, email: "test@example.com", createdAt: "2026-08-20T08:00:00.000Z",
      firstName: "Test", lastName: "Account", passwordSignInEnabled: true,
    },
  };
}

function seedSession(withProfile = true): void {
  const session: AuthSession = {
    access_token: "original-access", refresh_token: "original-refresh", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer",
    user: {
      id: USER_ID, email: "test@example.com", created_at: "2026-08-20T08:00:00.000Z",
      user_metadata: {}, app_metadata: {},
    },
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  if (withProfile) {
    localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1, user: session.user, cloudStatus: "available",
    }));
  }
  localStorage.setItem("local-vault-sentinel", "preserved");
}

function createClient(fetchMock = vi.fn()): FavLockAuthClient {
  const client = new FavLockAuthClient({
    apiUrl: "https://api.favlock.example", authUrl: "https://auth.favlock.example",
    dashboardUrl: "https://dashboard.favlock.example", fetchImplementation: fetchMock,
    navigate: vi.fn(),
  });
  clients.push(client);
  return client;
}

function watch(client: FavLockAuthClient) {
  const listener = vi.fn();
  client.onAuthStateChange(listener);
  stops.push(client.startCrossTabSynchronization());
  return listener;
}

function storageEvent(key: string | null, newValue: string | null, oldValue: string | null = null): void {
  window.dispatchEvent(new StorageEvent("storage", { key, newValue, oldValue, storageArea: localStorage }));
}

function signIn(client: FavLockAuthClient) {
  return client.signInWithPassword({
    email: "test@example.com", password: "fake-test-password", options: { captchaToken: "fake-captcha" },
  });
}

function startPkce(client: FavLockAuthClient, flow: "sign-in" | "recovery") {
  return flow === "sign-in"
    ? client.signInWithOAuth({
      provider: "google", options: { redirectTo: "https://dashboard.favlock.example/library" },
    })
    : client.resetPasswordForEmail("test@example.com", {
      redirectTo: "https://dashboard.favlock.example/reset-password", captchaToken: "fake-captcha",
    });
}

function rejectLocalWrites(keyToReject: string, name: "SecurityError" | "QuotaExceededError") {
  const storage = localStorage;
  const setItem = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (this === storage && key === keyToReject) throw new DOMException("Test storage write failed.", name);
    return setItem.call(this, key, value);
  });
}

function rejectLocalReads() {
  const storage = localStorage;
  const getItem = Storage.prototype.getItem;
  return vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
    if (this === storage) throw new DOMException("Test storage access denied.", "SecurityError");
    return getItem.call(this, key);
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/library");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  for (const client of clients.splice(0)) client.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("local account lifecycle across tabs", () => {
  it.each([USER_ID, OTHER_USER_ID])("detaches a delayed tab after logout and login as %s without deleting the new credentials", async (nextUserId) => {
    seedSession();
    const tabA = createClient(vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/logout")) return response({ data: {} });
      if (url.endsWith("/sign-in/password")) return response({ data: { session: apiSession(nextUserId) } });
      throw new Error("Unexpected authentication request.");
    }));
    const tabBFetch = vi.fn();
    const tabB = createClient(tabBFetch);
    await Promise.all([tabA.getSession(), tabB.getSession()]);
    const oldRequest = await tabB.getRequestSession("original-access");
    const listener = watch(tabB);
    const oldProfile = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
    const oldSession = localStorage.getItem(SESSION_STORAGE_KEY);

    await tabA.signOut();
    expect((await signIn(tabA)).error).toBeNull();
    const newProfile = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
    const newSession = localStorage.getItem(SESSION_STORAGE_KEY);
    localStorage.setItem("local-vault-sentinel", "next-account-vault");

    // Tab B was suspended while A completed the full logout/login sequence.
    storageEvent(LOCAL_PROFILE_STORAGE_KEY, null, oldProfile);
    storageEvent(SESSION_STORAGE_KEY, null, oldSession);
    storageEvent(SESSION_STORAGE_KEY, newSession);
    storageEvent(LOCAL_PROFILE_STORAGE_KEY, newProfile);
    await Promise.resolve();

    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe(newSession);
    expect(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)).toBe(newProfile);
    expect(localStorage.getItem("local-vault-sentinel")).toBe("next-account-vault");
    expect(tabB.isRequestSessionCurrent(oldRequest)).toBe(false);
    expect(tabB.getLocalUser()).toBeNull();
    expect(tabB.getCloudStatus()).toBe("signed_out");
    const detached = await tabB.getSession();
    expect(detached.data.session).toBeNull();
    expect(detached.error?.message).toMatch(/reload/i);
    expect(listener).toHaveBeenCalledWith("LOCAL_ACCOUNT_INVALIDATED", null);
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
    expect(tabBFetch).not.toHaveBeenCalled();
    expect((await tabA.getSession()).data.session?.user.id).toBe(nextUserId);
    expect((await tabA.getSession()).data.session?.refresh_token).toBe("fresh-refresh");
    await expect(tabB.getRequestSession("fresh-access")).rejects.toBeInstanceOf(Error);
    expect(tabB.getLocalUser()).toBeNull();
    const reloadedTab = createClient(tabBFetch);
    expect((await reloadedTab.getSession()).data.session?.user.id).toBe(nextUserId);
    expect(tabBFetch).not.toHaveBeenCalled();
  });

  it("does not erase a new session while its matching local profile is still being written", async () => {
    seedSession();
    const tabA = createClient(vi.fn().mockImplementation(async (url: string) => url.endsWith("/logout")
      ? response({ data: {} }) : response({ data: { session: apiSession(OTHER_USER_ID) } })));
    const tabB = createClient();
    await Promise.all([tabA.getSession(), tabB.getSession()]);
    const listener = watch(tabB);
    const oldProfile = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
    await tabA.signOut();
    const storage = localStorage;
    const setItem = Storage.prototype.setItem;
    let delivered = false;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      setItem.call(this, key, value);
      if (this === storage && key === SESSION_STORAGE_KEY && !delivered) {
        delivered = true;
        // Another tab can handle a queued event between two synchronous writes.
        storageEvent(LOCAL_PROFILE_STORAGE_KEY, null, oldProfile);
      }
    });

    expect((await signIn(tabA)).error).toBeNull();
    await Promise.resolve();

    expect(delivered).toBe(true);
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "null")).toMatchObject({ refresh_token: "fresh-refresh" });
    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY) ?? "null")).toMatchObject({ user: { id: OTHER_USER_ID } });
    expect(tabB.getLocalUser()).toBeNull();
    expect(listener).toHaveBeenCalledWith("LOCAL_ACCOUNT_INVALIDATED", null);
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
  });

  it("keeps the same local account when another tab reconnects without signing out", async () => {
    seedSession();
    const tabA = createClient(vi.fn().mockResolvedValue(response({ data: { session: apiSession() } })));
    const tabB = createClient();
    await Promise.all([tabA.getSession(), tabB.getSession()]);
    const oldRequest = await tabB.getRequestSession("original-access");
    const listener = watch(tabB);
    expect((await signIn(tabA)).error).toBeNull();

    storageEvent(SESSION_STORAGE_KEY, localStorage.getItem(SESSION_STORAGE_KEY));
    storageEvent(LOCAL_PROFILE_STORAGE_KEY, localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY));
    await Promise.resolve();

    expect(tabB.getLocalUser()?.id).toBe(USER_ID);
    expect((await tabB.getSession()).data.session?.refresh_token).toBe("fresh-refresh");
    expect(tabB.isRequestSessionCurrent(oldRequest)).toBe(false);
    expect(listener).not.toHaveBeenCalledWith("LOCAL_ACCOUNT_INVALIDATED", null);
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it("revokes only this tab's identity when clear() sends a null storage key", async () => {
    seedSession();
    const client = createClient();
    const request = await client.getRequestSession("original-access");
    const listener = watch(client);

    localStorage.clear();
    storageEvent(null, null);
    await Promise.resolve();

    expect(client.getLocalUser()).toBeNull();
    expect(client.getCloudStatus()).toBe("signed_out");
    expect(client.isRequestSessionCurrent(request)).toBe(false);
    const result = await client.getSession();
    expect(result.data.session).toBeNull();
    expect(result.error?.message).toMatch(/reload/i);
    expect(listener).toHaveBeenCalledWith("LOCAL_ACCOUNT_INVALIDATED", null);
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
  });

  it("preserves the local account and vault when only cloud credentials are deleted", async () => {
    seedSession();
    const client = createClient();
    const request = await client.getRequestSession("original-access");
    const listener = watch(client);
    const profile = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
    const oldSession = localStorage.getItem(SESSION_STORAGE_KEY);

    localStorage.removeItem(SESSION_STORAGE_KEY);
    storageEvent(SESSION_STORAGE_KEY, null, oldSession);
    await Promise.resolve();

    expect((await client.getSession()).data.session).toBeNull();
    expect(client.getLocalUser()?.id).toBe(USER_ID);
    expect(client.getCloudStatus()).toBe("reconnect_required");
    expect(client.isRequestSessionCurrent(request)).toBe(false);
    expect(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)).toBe(profile);
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    expect(listener).not.toHaveBeenCalledWith("LOCAL_ACCOUNT_INVALIDATED", null);
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
  });

  it.each([USER_ID, OTHER_USER_ID])("detects a remote login as %s on visible offline resume without storage events", async (nextUserId) => {
    seedSession();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const tabA = createClient(vi.fn().mockImplementation(async (url: string) => url.endsWith("/logout")
      ? response({ data: {} }) : response({ data: { session: apiSession(nextUserId) } })));
    const tabBFetch = vi.fn();
    const tabB = createClient(tabBFetch);
    await Promise.all([tabA.getSession(), tabB.getSession()]);
    const request = await tabB.getRequestSession("original-access");
    const listener = watch(tabB);
    await tabA.signOut();
    expect((await signIn(tabA)).error).toBeNull();
    const newSession = localStorage.getItem(SESSION_STORAGE_KEY);
    const newProfile = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith("LOCAL_ACCOUNT_INVALIDATED", null));

    expect(tabB.getLocalUser()).toBeNull();
    expect(tabB.isRequestSessionCurrent(request)).toBe(false);
    expect(tabB.getCloudStatus()).toBe("signed_out");
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe(newSession);
    expect(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)).toBe(newProfile);
    expect(tabBFetch).not.toHaveBeenCalled();
  });
});

describe("storage failures and repair", () => {
  it.each(["initialize", "getSession"] as const)("returns a safe %s error for denied storage reads and retries after access returns", async (method) => {
    seedSession();
    const storage = localStorage;
    const getItem = Storage.prototype.getItem;
    const originalSession = getItem.call(storage, SESSION_STORAGE_KEY);
    const reads = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      if (this === storage) throw new DOMException("Test storage access denied.", "SecurityError");
      return getItem.call(this, key);
    });
    const fetchMock = vi.fn();
    const client = createClient(fetchMock);

    await expect(client[method]()).resolves.toMatchObject({ error: expect.any(Error) });

    expect(getItem.call(storage, SESSION_STORAGE_KEY)).toBe(originalSession);
    expect(() => client.getCloudStatus()).not.toThrow();
    expect(client.getCloudStatus()).not.toBe("available");
    expect(fetchMock).not.toHaveBeenCalled();
    reads.mockRestore();
    const recovered = await client.getSession();
    expect(recovered.error).toBeNull();
    expect(recovered.data.session?.refresh_token).toBe("original-refresh");
    expect(client.getCloudStatus()).toBe("available");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it("recovers when obtaining window.localStorage itself temporarily throws", async () => {
    seedSession();
    const storage = localStorage;
    const access = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Test localStorage is blocked.", "SecurityError");
    });
    const client = createClient();

    await expect(client.getSession()).resolves.toMatchObject({ error: expect.any(Error) });

    expect(storage.getItem(SESSION_STORAGE_KEY)).toContain("original-refresh");
    access.mockRestore();
    const recovered = await client.getSession();
    expect(recovered.error).toBeNull();
    expect(recovered.data.session?.access_token).toBe("original-access");
  });

  it("does not mistake a temporary read failure for deletion of an already loaded vault", async () => {
    seedSession();
    const client = createClient();
    await client.getSession();
    const listener = watch(client);
    const storage = localStorage;
    const getItem = Storage.prototype.getItem;
    const originalSession = getItem.call(storage, SESSION_STORAGE_KEY);
    const reads = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      if (this === storage) throw new DOMException("Test storage access denied.", "SecurityError");
      return getItem.call(this, key);
    });

    const failed = await client.getSession();
    expect(getItem.call(storage, SESSION_STORAGE_KEY)).toBe(originalSession);
    expect(failed.error).toBeInstanceOf(Error);
    expect(client.getLocalUser()?.id).toBe(USER_ID);
    expect(client.getCloudStatus()).toBe("unavailable");
    expect(listener).not.toHaveBeenCalledWith("LOCAL_ACCOUNT_INVALIDATED", null);
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
    reads.mockRestore();
    const recovered = await client.getSession();
    expect(recovered.error).toBeNull();
    expect(recovered.data.session?.refresh_token).toBe("original-refresh");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it.each(["SecurityError", "QuotaExceededError"] as const)("does not publish a signed-in account if session persistence throws %s", async (name) => {
    localStorage.setItem("local-vault-sentinel", "preserved");
    const fetchMock = vi.fn().mockImplementation(async () => response({ data: { session: apiSession() } }));
    const client = createClient(fetchMock);
    await client.initialize();
    const listener = watch(client);
    const writes = rejectLocalWrites(SESSION_STORAGE_KEY, name);

    const failed = await signIn(client);

    expect(failed.error).toBeInstanceOf(Error);
    expect(failed.data.session).toBeNull();
    expect(client.getLocalUser()).toBeNull();
    expect(client.getCloudStatus()).not.toBe("available");
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(listener).not.toHaveBeenCalledWith("SIGNED_IN", expect.anything());
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    writes.mockRestore();
    expect((await signIn(client)).error).toBeNull();
    expect((await client.getSession()).data.session?.refresh_token).toBe("fresh-refresh");
    expect(client.getCloudStatus()).toBe("available");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a recoverable error when migrating a saved session cannot write its local profile", async () => {
    seedSession(false);
    const fetchMock = vi.fn();
    const client = createClient(fetchMock);
    const writes = rejectLocalWrites(LOCAL_PROFILE_STORAGE_KEY, "QuotaExceededError");

    await expect(client.initialize()).resolves.toMatchObject({ error: expect.any(Error) });

    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toContain("original-refresh");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    writes.mockRestore();
    const recovered = await client.getSession();
    expect(recovered.error).toBeNull();
    expect(recovered.data.session?.refresh_token).toBe("original-refresh");
    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).user.id).toBe(USER_ID);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps rotated credentials when the profile write fails and repairs it without another refresh", async () => {
    seedSession();
    const fetchMock = vi.fn().mockImplementation(async () => response({ data: { session: apiSession(USER_ID, "rotated") } }));
    const client = createClient(fetchMock);
    await client.getSession();
    client.markCloudFailure("original-access", "unavailable");
    const listener = watch(client);
    const writes = rejectLocalWrites(LOCAL_PROFILE_STORAGE_KEY, "QuotaExceededError");

    const refreshError = await client.retryCloudConnection().then(() => null, (error: unknown) => error);

    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).refresh_token).toBe("rotated-refresh");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    expect(client.getLocalUser()?.id).toBe(USER_ID);
    expect(client.getCloudStatus()).toBe("unavailable");
    expect(refreshError).toBeInstanceOf(Error);
    expect(listener).not.toHaveBeenCalledWith("LOCAL_ACCOUNT_INVALIDATED", null);
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
    writes.mockRestore();

    const recovered = await client.getSession();

    expect(recovered.error).toBeNull();
    expect(recovered.data.session?.refresh_token).toBe("rotated-refresh");
    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).cloudStatus).toBe("available");
    expect(client.getCloudStatus()).toBe("available");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not rehydrate failed logout leftovers on reload or after a failed new login", async () => {
    seedSession();
    const fetchMock = vi.fn().mockImplementation(async (url: string) => url.endsWith("/logout")
      ? response({ data: {} }) : response({ data: { session: apiSession(OTHER_USER_ID) } }));
    const client = createClient(fetchMock);
    await client.getSession();
    const originalRequest = await client.getRequestSession("original-access");
    const listener = watch(client);
    const storage = localStorage;
    const removeItem = Storage.prototype.removeItem;
    const removals = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
      if (this === storage && key === SESSION_STORAGE_KEY) {
        throw new DOMException("Test credential removal denied.", "SecurityError");
      }
      return removeItem.call(this, key);
    });

    const signedOut = await client.signOut();

    expect(signedOut.error).toBeInstanceOf(Error);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toContain("original-refresh");
    expect(client.getLocalUser()).toBeNull();
    expect((await client.getSession()).data.session).toBeNull();
    expect(client.isRequestSessionCurrent(originalRequest)).toBe(false);
    expect(listener).toHaveBeenCalledWith("SIGNED_OUT", null);
    removals.mockRestore();

    const reloadedFetch = vi.fn();
    const reloaded = createClient(reloadedFetch);
    expect((await reloaded.getSession()).data.session).toBeNull();
    expect(reloaded.getLocalUser()).toBeNull();
    expect(reloadedFetch).not.toHaveBeenCalled();

    const writes = rejectLocalWrites(SESSION_STORAGE_KEY, "QuotaExceededError");
    expect((await signIn(client)).error).toBeInstanceOf(Error);
    const reloadedAfterFailure = createClient(reloadedFetch);
    expect((await reloadedAfterFailure.getSession()).data.session).toBeNull();
    expect(reloadedAfterFailure.getLocalUser()).toBeNull();
    writes.mockRestore();

    expect((await signIn(client)).error).toBeNull();
    const reloadedAfterLogin = createClient(reloadedFetch);
    expect((await reloadedAfterLogin.getSession()).data.session?.user.id).toBe(OTHER_USER_ID);
    expect(reloadedAfterLogin.getLocalUser()?.id).toBe(OTHER_USER_ID);
    expect(reloadedFetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, "reconnect_required"], [403, "restricted"],
  ] as const)("retains a real HTTP %s refresh denial after repairing its failed profile write", async (status, expectedStatus) => {
    seedSession();
    const fetchMock = vi.fn().mockImplementation(async () => response({ error: { message: "Test server denial." } }, status));
    const client = createClient(fetchMock);
    await client.getSession();
    const writes = rejectLocalWrites(LOCAL_PROFILE_STORAGE_KEY, "QuotaExceededError");

    await expect(client.retryCloudConnection()).rejects.toBeInstanceOf(Error);
    expect(client.getCloudStatus()).toBe("unavailable");
    writes.mockRestore();
    await client.getSession();

    expect(client.getCloudStatus()).toBe(expectedStatus);
    const profile = JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!);
    expect(profile.cloudStatus).toBe(expectedStatus);
    expect(profile.refreshRejected).toBe(status === 401);
    await expect(client.getRequestSession("original-access")).rejects.toMatchObject({ code: expectedStatus });
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toContain("original-refresh");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(["preflight", "401 recovery"] as const)("classifies blocked storage during %s as temporary unavailability, not a changed account", async (phase) => {
    seedSession();
    const fetchMock = vi.fn();
    const client = createClient(fetchMock);
    const request = await client.getRequestSession("original-access");
    const listener = watch(client);
    const reads = rejectLocalReads();

    const pending = phase === "preflight"
      ? client.getRequestSession("original-access") : client.refreshRequestSession(request);
    await expect(pending).rejects.toBeInstanceOf(CloudAccessError);
    await expect(pending).rejects.toMatchObject({ code: "unavailable", message: expect.stringMatching(/storage/i) });

    expect(client.getLocalUser()?.id).toBe(USER_ID);
    expect(listener).not.toHaveBeenCalledWith("LOCAL_ACCOUNT_INVALIDATED", null);
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
    expect(fetchMock).not.toHaveBeenCalled();
    reads.mockRestore();
    expect((await client.getRequestSession("original-access")).accessToken).toBe("original-access");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["sign-in", "retry"] as const)("recovers a freshly persisted %s session despite an older rejected profile after reload", async (action) => {
    seedSession();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ error: { message: "Test server rejected the original session." } }, 401))
      .mockResolvedValueOnce(response({ data: { session: apiSession() } }));
    const client = createClient(fetchMock);
    await client.getSession();
    await expect(client.retryCloudConnection()).rejects.toBeInstanceOf(Error);
    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).refreshRejected).toBe(true);
    const writes = rejectLocalWrites(LOCAL_PROFILE_STORAGE_KEY, "QuotaExceededError");

    if (action === "sign-in") expect((await signIn(client)).error).toBeInstanceOf(Error);
    else await expect(client.retryCloudConnection()).rejects.toBeInstanceOf(Error);

    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).refresh_token).toBe("fresh-refresh");
    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).refreshRejected).toBe(true);
    expect(client.getCloudStatus()).toBe("unavailable");
    writes.mockRestore();
    client.dispose();
    const reloadFetch = vi.fn();
    const reloaded = createClient(reloadFetch);

    const restored = await reloaded.getSession();

    expect(restored.error).toBeNull();
    expect(restored.data.session?.refresh_token).toBe("fresh-refresh");
    expect(reloaded.getCloudStatus()).toBe("available");
    expect((await reloaded.getRequestSession("fresh-access")).accessToken).toBe("fresh-access");
    const profile = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!;
    expect(JSON.parse(profile).refreshRejected).not.toBe(true);
    expect(profile).not.toMatch(/original-access|original-refresh|fresh-access|fresh-refresh/);
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    expect(reloadFetch).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retains an unpersisted server rotation privately until storage can save it without reusing the old refresh token", async () => {
    seedSession();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: { session: apiSession(USER_ID, "rotated") } }))
      .mockRejectedValue(new Error("The old refresh token must not be replayed."));
    const client = createClient(fetchMock);
    const originalRequest = await client.getRequestSession("original-access");
    const listener = watch(client);
    const writes = rejectLocalWrites(SESSION_STORAGE_KEY, "QuotaExceededError");

    await expect(client.retryCloudConnection()).rejects.toBeInstanceOf(Error);

    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toContain("original-refresh");
    expect(client.getCloudStatus()).toBe("unavailable");
    await expect(client.getRequestSession("original-access")).rejects.toMatchObject({ code: "unavailable" });
    expect(client.isRequestSessionCurrent(originalRequest)).toBe(false);
    expect(listener).not.toHaveBeenCalledWith("TOKEN_REFRESHED", expect.objectContaining({ access_token: "rotated-access" }));
    expect(listener).not.toHaveBeenCalledWith("LOCAL_ACCOUNT_INVALIDATED", null);
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
    expect(client.getLocalUser()?.id).toBe(USER_ID);
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    writes.mockRestore();

    const restored = await client.getSession();

    expect(restored.error).toBeNull();
    expect(restored.data.session?.refresh_token).toBe("rotated-refresh");
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).refresh_token).toBe("rotated-refresh");
    expect((await client.getRequestSession("original-access")).accessToken).toBe("rotated-access");
    expect(client.getCloudStatus()).toBe("available");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("PKCE callbacks after explicit logout", () => {
  const flows = [
    { flow: "sign-in", event: "SIGNED_IN", path: "/library" },
    { flow: "recovery", event: "PASSWORD_RECOVERY", path: "/reset-password" },
  ] as const;

  it.each(flows)("accepts a fresh $flow callback created after logout", async ({ flow, event, path }) => {
    seedSession();
    const startFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/session/logout") || url.endsWith("/password/reset")) return response({ data: {} });
      throw new Error("Unexpected request before the callback.");
    });
    const client = createClient(startFetch);
    await client.getSession();
    expect((await client.signOut()).error).toBeNull();
    expect(client.getLocalUser()).toBeNull();

    expect((await startPkce(client, flow)).error).toBeNull();
    const pkce = JSON.parse(localStorage.getItem(PKCE_STORAGE_KEY)!);
    expect(pkce).toMatchObject({ verifier: expect.stringMatching(/^[A-Za-z0-9_-]{64}$/), redirectType: flow });
    client.dispose();
    window.history.replaceState({}, "", `${path}?code=fake-new-callback-code&view=test`);
    const callbackFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/session/exchange")) return response({ data: { session: apiSession(USER_ID, "callback") } });
      throw new Error("Unexpected callback request.");
    });
    const callbackClient = createClient(callbackFetch);
    const listener = watch(callbackClient);

    const restored = await callbackClient.getSession();

    expect(restored.error).toBeNull();
    expect(restored.data.session?.refresh_token).toBe("callback-refresh");
    expect(callbackClient.getLocalUser()?.id).toBe(USER_ID);
    expect(callbackClient.getCloudStatus()).toBe("available");
    expect(callbackFetch).toHaveBeenCalledOnce();
    expect(callbackFetch).toHaveBeenCalledWith("https://api.favlock.example/v1/auth/session/exchange", expect.objectContaining({
      method: "POST", body: JSON.stringify({ authCode: "fake-new-callback-code", codeVerifier: pkce.verifier }),
    }));
    expect(listener).toHaveBeenCalledWith(event, expect.objectContaining({ access_token: "callback-access" }));
    expect(listener).not.toHaveBeenCalledWith("LOCAL_ACCOUNT_INVALIDATED", null);
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).toBeNull();
    expect(new URL(window.location.href).searchParams.get("code")).toBeNull();
    expect(new URL(window.location.href).searchParams.get("view")).toBe("test");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it.each(flows)("cannot restore a pre-logout $flow callback whose PKCE removal failed", async ({ flow, path }) => {
    seedSession();
    const client = createClient(vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/session/logout") || url.endsWith("/password/reset")) return response({ data: {} });
      throw new Error("Unexpected request before logout.");
    }));
    await client.getSession();
    expect((await startPkce(client, flow)).error).toBeNull();
    const oldPkce = localStorage.getItem(PKCE_STORAGE_KEY);
    const storage = localStorage;
    const removeItem = Storage.prototype.removeItem;
    const removals = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
      if (this === storage && key === PKCE_STORAGE_KEY) throw new DOMException("Test PKCE removal denied.", "SecurityError");
      return removeItem.call(this, key);
    });

    expect((await client.signOut()).error).toBeInstanceOf(Error);
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).toBe(oldPkce);
    removals.mockRestore();
    client.dispose();
    window.history.replaceState({}, "", `${path}?code=fake-stale-callback-code`);
    const callbackFetch = vi.fn().mockResolvedValue(response({ data: { session: apiSession(USER_ID, "stale") } }));
    const callbackClient = createClient(callbackFetch);
    const listener = watch(callbackClient);

    const restored = await callbackClient.getSession();

    expect(restored.data.session).toBeNull();
    expect(callbackClient.getLocalUser()).toBeNull();
    expect(callbackClient.getCloudStatus()).toBe("signed_out");
    expect(callbackFetch).not.toHaveBeenCalled();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)).toBeNull();
    expect(listener).not.toHaveBeenCalledWith("SIGNED_IN", expect.anything());
    expect(listener).not.toHaveBeenCalledWith("PASSWORD_RECOVERY", expect.anything());
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it.each([USER_ID, OTHER_USER_ID])("cannot undo logout and a fresh login as %s while a callback is in flight", async (nextUserId) => {
    seedSession();
    const tabA = createClient(vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/session/logout")) return response({ data: {} });
      if (url.endsWith("/sign-in/password")) return response({ data: { session: apiSession(nextUserId) } });
      throw new Error("Unexpected request in the account-owning tab.");
    }));
    await tabA.getSession();
    expect((await startPkce(tabA, "sign-in")).error).toBeNull();
    window.history.replaceState({}, "", "/library?code=fake-in-flight-code");
    let finishExchange!: (value: Response) => void;
    const exchange = new Promise<Response>((resolve) => { finishExchange = resolve; });
    const callbackFetch = vi.fn().mockReturnValue(exchange);
    const callbackClient = createClient(callbackFetch);
    const listener = watch(callbackClient);
    const pendingCallback = callbackClient.getSession();
    await vi.waitFor(() => expect(callbackFetch).toHaveBeenCalledOnce());

    expect((await tabA.signOut()).error).toBeNull();
    expect((await signIn(tabA)).error).toBeNull();
    expect((await startPkce(tabA, "sign-in")).error).toBeNull();
    const freshPkce = localStorage.getItem(PKCE_STORAGE_KEY);
    const freshSession = localStorage.getItem(SESSION_STORAGE_KEY);
    const freshProfile = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
    localStorage.setItem("local-vault-sentinel", "next-account-vault");
    finishExchange(response({ data: { session: apiSession(USER_ID, "late-callback") } }));

    const cancelled = await pendingCallback;

    expect(cancelled.error?.message).toMatch(/cancelled|reload/i);
    expect(cancelled.data.session).toBeNull();
    expect(callbackClient.getLocalUser()).toBeNull();
    expect(callbackClient.getCloudStatus()).toBe("signed_out");
    expect(listener).toHaveBeenCalledWith("LOCAL_ACCOUNT_INVALIDATED", null);
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
    expect(listener).not.toHaveBeenCalledWith("SIGNED_IN", expect.objectContaining({ access_token: "late-callback-access" }));
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).toBe(freshPkce);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe(freshSession);
    expect(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)).toBe(freshProfile);
    expect(localStorage.getItem("local-vault-sentinel")).toBe("next-account-vault");
    expect((await tabA.getSession()).data.session?.refresh_token).toBe("fresh-refresh");
    expect(tabA.getLocalUser()?.id).toBe(nextUserId);
    expect(callbackFetch).toHaveBeenCalledOnce();
  });

  it("repairs a callback profile-write failure without exchanging the consumed code again", async () => {
    seedSession();
    const client = createClient(vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/session/logout") || url.endsWith("/password/reset")) return response({ data: {} });
      throw new Error("Unexpected request before the recovery callback.");
    }));
    await client.getSession();
    expect((await client.signOut()).error).toBeNull();
    expect((await startPkce(client, "recovery")).error).toBeNull();
    client.dispose();
    window.history.replaceState({}, "", "/reset-password?code=fake-consumed-code&sb_flow_id=fake-flow&view=test");
    const callbackFetch = vi.fn()
      .mockResolvedValueOnce(response({ data: { session: apiSession(USER_ID, "callback") } }))
      .mockRejectedValue(new Error("The consumed callback code must not be exchanged twice."));
    const callbackClient = createClient(callbackFetch);
    const listener = watch(callbackClient);
    const writes = rejectLocalWrites(LOCAL_PROFILE_STORAGE_KEY, "QuotaExceededError");

    const interrupted = await callbackClient.getSession();

    expect(interrupted.error?.message).toMatch(/storage/i);
    expect(callbackClient.getCloudStatus()).toBe("unavailable");
    expect(callbackClient.getLocalUser()?.id).toBe(USER_ID);
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).refresh_token).toBe("callback-refresh");
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).toBeNull();
    const callbackUrl = new URL(window.location.href);
    expect(callbackUrl.searchParams.get("code")).toBeNull();
    expect(callbackUrl.searchParams.get("sb_flow_id")).toBeNull();
    expect(callbackUrl.searchParams.get("view")).toBe("test");
    await expect(callbackClient.getRequestSession("callback-access")).rejects.toMatchObject({ code: "unavailable" });
    expect(listener).not.toHaveBeenCalledWith("LOCAL_ACCOUNT_INVALIDATED", null);
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    expect(callbackFetch).toHaveBeenCalledOnce();
    writes.mockRestore();

    const repaired = await callbackClient.getSession();

    expect(repaired.error).toBeNull();
    expect(repaired.data.session?.refresh_token).toBe("callback-refresh");
    expect(callbackClient.getCallbackFailure()).toBeNull();
    expect(callbackClient.getCloudStatus()).toBe("available");
    expect((await callbackClient.getRequestSession("callback-access")).accessToken).toBe("callback-access");
    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!)).toMatchObject({ user: { id: USER_ID }, cloudStatus: "available" });
    const reloaded = createClient(callbackFetch);
    expect((await reloaded.getSession()).data.session?.refresh_token).toBe("callback-refresh");
    expect(reloaded.getCloudStatus()).toBe("available");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    expect(callbackFetch).toHaveBeenCalledOnce();
  });

  it.each(flows)("accepts legacy $flow PKCE without a logout marker", async ({ flow, event, path }) => {
    localStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify({ verifier: "v".repeat(64), redirectType: flow }));
    localStorage.setItem("local-vault-sentinel", "preserved");
    window.history.replaceState({}, "", `${path}?code=fake-legacy-callback-code`);
    const fetchMock = vi.fn().mockResolvedValue(response({ data: { session: apiSession(USER_ID, "legacy-callback") } }));
    const client = createClient(fetchMock);
    const listener = watch(client);

    const restored = await client.getSession();

    expect(restored.error).toBeNull();
    expect(restored.data.session?.refresh_token).toBe("legacy-callback-refresh");
    expect(client.getLocalUser()?.id).toBe(USER_ID);
    expect(client.getCloudStatus()).toBe("available");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.favlock.example/v1/auth/session/exchange");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      authCode: "fake-legacy-callback-code", codeVerifier: "v".repeat(64),
    });
    expect(listener).toHaveBeenCalledWith(event, expect.objectContaining({ access_token: "legacy-callback-access" }));
    expect(localStorage.getItem(PKCE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });
});
