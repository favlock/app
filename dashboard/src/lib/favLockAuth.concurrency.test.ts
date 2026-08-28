import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FavLockAuthClient, LOCAL_PROFILE_STORAGE_KEY, type AuthSession } from "./favLockAuth";

const API_URL = "https://api.favlock.example";
const SESSION_STORAGE_KEY = "favlock.auth.session.v1";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_SESSION_ID = "44444444-4444-4444-8444-444444444444";

type RefreshLocks = {
  request: (name: string, options: LockOptions, callback: () => Promise<AuthSession>) => Promise<AuthSession>;
};

function stubBrowserLocks(locks?: RefreshLocks): void {
  vi.stubGlobal("navigator", new Proxy(navigator, {
    get(target, property) {
      return property === "locks" ? locks : Reflect.get(target, property, target);
    },
  }));
}

function heldRefreshLock() {
  const queue: Array<() => void> = [];
  let holderPresent = true;
  let callbackRunning = false;

  function drain(): void {
    while (!holderPresent && !callbackRunning && queue.length) queue.shift()!();
  }

  const request = vi.fn((_name: string, options: LockOptions, callback: () => Promise<AuthSession>) => {
    return new Promise<AuthSession>((resolve, reject) => {
      let cancelled = false;
      const abort = () => {
        cancelled = true;
        reject(new DOMException("The lock request was aborted.", "AbortError"));
      };
      if (options.signal?.aborted) {
        abort();
        return;
      }
      options.signal?.addEventListener("abort", abort, { once: true });
      queue.push(() => {
        options.signal?.removeEventListener("abort", abort);
        if (cancelled) return;
        callbackRunning = true;
        void Promise.resolve().then(callback).then(resolve, reject).finally(() => {
          callbackRunning = false;
          drain();
        });
      });
      drain();
    });
  });

  return {
    request,
    releaseHolder() {
      holderPresent = false;
      drain();
    },
  };
}

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

function settle<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ value, error: null }),
    (error: unknown) => ({ value: null, error }),
  );
}

function storedSession({
  userId = USER_ID,
  sessionId = SESSION_ID,
  revision = 0,
  expiresAt = Math.floor(Date.now() / 1000) + 3600,
} = {}): AuthSession {
  const encode = (value: Record<string, unknown>) => btoa(JSON.stringify(value))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, session_id: sessionId, revision })}.fake-test-signature`,
    refresh_token: `fake-refresh-${sessionId}-${revision}`,
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: "bearer",
    user: {
      id: userId,
      email: userId === USER_ID ? "ada@example.com" : "grace@example.com",
      created_at: "2026-08-20T08:00:00.000Z",
      user_metadata: { first_name: "Test", last_name: "User", password_sign_in_enabled: true },
      app_metadata: { provider: "email", providers: ["email"] },
      identities: [{ provider: "email" }],
    },
  };
}

function sessionResponse(session: AuthSession): Response {
  return response({
    data: { session: {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      expiresAt: session.expires_at,
      user: {
        id: session.user.id,
        email: session.user.email,
        firstName: "Test",
        lastName: "User",
        createdAt: session.user.created_at,
        passwordSignInEnabled: true,
      },
    } },
  });
}

function seedSession(session: AuthSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  localStorage.setItem("local-vault-sentinel", "preserved");
}

function notifyLatestStorage(): void {
  // Storage events reach other tabs later than the originating storage writes.
  for (const key of [SESSION_STORAGE_KEY, LOCAL_PROFILE_STORAGE_KEY]) {
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: localStorage.getItem(key) }));
  }
}

describe("FavLockAuthClient refresh concurrency", () => {
  const clients: FavLockAuthClient[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T08:00:00.000Z"));
    localStorage.clear();
    sessionStorage.clear();
    for (const item of document.cookie.split(";")) {
      const name = item.trim().split("=")[0];
      if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
    }
    window.history.replaceState({}, "", "/library");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    stubBrowserLocks();
  });

  afterEach(() => {
    for (const client of clients) client.dispose();
    clients.length = 0;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function createClient(fetchImplementation: typeof fetch): FavLockAuthClient {
    const client = new FavLockAuthClient({
      apiUrl: API_URL,
      authUrl: "https://auth.favlock.example",
      dashboardUrl: "https://dashboard.favlock.example",
      fetchImplementation,
      navigate: vi.fn(),
    });
    clients.push(client);
    return client;
  }

  it("bounds an ungranted refresh lock to eight seconds and retries after its holder releases", async () => {
    const locks = heldRefreshLock();
    stubBrowserLocks(locks);
    const original = storedSession({ expiresAt: Math.floor(Date.now() / 1000) - 1 });
    seedSession(original);
    const recovered = storedSession({ revision: 1 });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => sessionResponse(recovered));
    const client = createClient(fetchMock);
    const listener = vi.fn();
    client.onAuthStateChange(listener);
    const completed = vi.fn();
    const pending = client.getSession().then((result) => {
      completed(result);
      return result;
    });

    await vi.advanceTimersByTimeAsync(7_999);
    expect(locks.request).toHaveBeenCalledOnce();
    expect(completed).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    // Assert settlement before awaiting, so a missing timeout fails without hanging the test.
    expect(completed).toHaveBeenCalledOnce();
    const result = await pending;
    expect(result.error?.message).toBe("Authentication is temporarily unavailable.");
    expect(result.data.session?.refresh_token).toBe(original.refresh_token);
    expect(client.getCloudStatus()).toBe("unavailable");
    expect(client.getLocalUser()?.id).toBe(USER_ID);
    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).refreshRejected).not.toBe(true);
    expect(locks.request.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    locks.releaseHolder();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(locks.request).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(locks.request).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((await client.getSession()).error).toBeNull();
    expect((await client.getSession()).data.session?.access_token).toBe(recovered.access_token);
    expect(client.getCloudStatus()).toBe("available");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
  });

  it.each([
    { label: "same-account sign-in", signOutFirst: false, nextUserId: USER_ID },
    { label: "logout and same-account sign-in", signOutFirst: true, nextUserId: USER_ID },
    { label: "logout and different-account sign-in", signOutFirst: true, nextUserId: OTHER_USER_ID },
  ])("does not run a queued old refresh after $label", async ({ signOutFirst, nextUserId }) => {
    const locks = heldRefreshLock();
    stubBrowserLocks(locks);
    const original = storedSession();
    const signedIn = storedSession({ userId: nextUserId, sessionId: OTHER_SESSION_ID });
    seedSession(original);
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (url === `${API_URL}/v1/auth/session/logout`) return response({ data: {} });
      if (url === `${API_URL}/v1/auth/sign-in/password`) return sessionResponse(signedIn);
      throw new Error("A queued stale refresh must not contact the server.");
    });
    const client = createClient(fetchMock);
    const context = await client.getRequestSession(original.access_token);
    const pending = settle(client.refreshRequestSession(context));
    await vi.advanceTimersByTimeAsync(0);
    expect(locks.request).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();

    if (signOutFirst) expect((await client.signOut()).error).toBeNull();
    const login = await client.signInWithPassword({
      email: signedIn.user.email,
      password: "fake-test-password",
      options: { captchaToken: "fake-test-captcha" },
    });
    expect(login.error).toBeNull();
    locks.releaseHolder();
    const result = await pending;

    expect(result.error).toEqual(expect.objectContaining({ message: "The account changed. Please try again." }));
    expect(client.isRequestSessionCurrent(context)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(signOutFirst ? 2 : 1);
    expect(fetchMock.mock.calls.some(([url]) => url === `${API_URL}/v1/auth/session/refresh`)).toBe(false);
    expect(client.getLocalUser()?.id).toBe(nextUserId);
    expect(client.getCloudStatus()).toBe("available");
    const current = await client.getRequestSession(signedIn.access_token);
    expect(current.userId).toBe(nextUserId);
    expect(current.generation).not.toBe(context.generation);
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).refresh_token).toBe(signedIn.refresh_token);
    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!)).toMatchObject({ cloudStatus: "available", refreshRejected: false });
  });

  it("does not resurrect or refresh a signed-out account when its queued lock is granted", async () => {
    const locks = heldRefreshLock();
    stubBrowserLocks(locks);
    const original = storedSession();
    seedSession(original);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response({ data: {} }));
    const client = createClient(fetchMock);
    const context = await client.getRequestSession(original.access_token);
    const pending = settle(client.refreshRequestSession(context));
    await vi.advanceTimersByTimeAsync(0);
    expect(locks.request).toHaveBeenCalledOnce();

    expect((await client.signOut()).error).toBeNull();
    locks.releaseHolder();
    expect((await pending).error).toEqual(expect.objectContaining({ message: "The account changed. Please try again." }));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/v1/auth/session/logout`);
    expect(client.getLocalUser()).toBeNull();
    expect(client.getCloudStatus()).toBe("signed_out");
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)).toBeNull();
  });

  describe.each(["401", "503", "network"] as const)("without Web Locks: %s from one of two concurrent refreshes", (failure) => {
    it.each([true, false])("converges on the successful rotation (failure arrives first: %s)", async (failureFirst) => {
      const original = storedSession();
      const rotated = storedSession({ revision: 1 });
      seedSession(original);
      const winnerResponse = deferredResponse();
      const loserResponse = deferredResponse();
      const winnerFetch = vi.fn<typeof fetch>().mockReturnValue(winnerResponse.promise);
      const loserFetch = vi.fn<typeof fetch>().mockReturnValue(loserResponse.promise);
      const winner = createClient(winnerFetch);
      const loser = createClient(loserFetch);
      winner.startCrossTabSynchronization();
      loser.startCrossTabSynchronization();
      const [winnerContext, loserContext] = await Promise.all([
        winner.getRequestSession(original.access_token), loser.getRequestSession(original.access_token),
      ]);
      const winnerRefresh = settle(winner.refreshRequestSession(winnerContext));
      const loserRefresh = settle(loser.refreshRequestSession(loserContext));
      await vi.advanceTimersByTimeAsync(0);

      expect(navigator.locks).toBeUndefined();
      for (const fetchMock of [winnerFetch, loserFetch]) {
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/v1/auth/session/refresh`);
        expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ refreshToken: original.refresh_token });
      }

      const fail = () => {
        if (failure === "network") loserResponse.reject(new TypeError("The refresh response was lost."));
        else loserResponse.resolve(response({ error: { message: "Refresh failed." } }, Number(failure)));
      };
      if (failureFirst) {
        fail();
        expect((await loserRefresh).error).toEqual(expect.objectContaining({
          code: failure === "401" ? "reconnect_required" : "unavailable",
        }));
        winnerResponse.resolve(sessionResponse(rotated));
        expect((await winnerRefresh).error).toBeNull();
      } else {
        winnerResponse.resolve(sessionResponse(rotated));
        expect((await winnerRefresh).error).toBeNull();
        fail();
        expect((await loserRefresh).error).toBeNull();
      }

      notifyLatestStorage();
      await vi.advanceTimersByTimeAsync(0);
      for (const [client, context] of [[winner, winnerContext], [loser, loserContext]] as const) {
        const current = await client.getRequestSession(original.access_token);
        expect(current.accessToken).toBe(rotated.access_token);
        expect(current.generation).toBe(context.generation);
        expect(client.isRequestSessionCurrent(context)).toBe(true);
        expect(client.getCloudStatus()).toBe("available");
        expect((await client.getSession()).error).toBeNull();
      }
      expect(winnerFetch).toHaveBeenCalledOnce();
      expect(loserFetch).toHaveBeenCalledOnce();
      expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).refresh_token).toBe(rotated.refresh_token);
      expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!)).toMatchObject({ cloudStatus: "available", refreshRejected: false });
      expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    });
  });

  it("preserves a real refresh denial after another tab adds a revision without rotating tokens", async () => {
    const original = storedSession();
    seedSession(original);
    const updatingFetch = vi.fn<typeof fetch>().mockImplementation(async () => response({ data: { user: {
      id: USER_ID,
      email: original.user.email,
      createdAt: original.user.created_at,
      firstName: "Updated",
      lastName: "User",
      passwordSignInEnabled: true,
    } } }));
    const rejectedFetch = vi.fn<typeof fetch>().mockImplementation(async () => response({
      error: { message: "The refresh credential was rejected." },
    }, 401));
    const updatingTab = createClient(updatingFetch);
    const otherTab = createClient(rejectedFetch);
    await Promise.all([updatingTab.getSession(), otherTab.getSession()]);
    const originalRequest = await otherTab.getRequestSession(original.access_token);
    otherTab.startCrossTabSynchronization();

    const update = await updatingTab.updateUser({
      password: "fake-new-password", current_password: "fake-current-password",
    });
    expect(update.error).toBeNull();
    const updatedSession = (await updatingTab.getSession()).data.session;
    expect(updatedSession).toMatchObject({
      access_token: original.access_token,
      refresh_token: original.refresh_token,
      local_revision: expect.any(String),
    });
    notifyLatestStorage();
    await vi.advanceTimersByTimeAsync(0);
    expect(otherTab.isRequestSessionCurrent(originalRequest)).toBe(true);

    await expect(otherTab.refreshRequestSession(originalRequest)).rejects.toMatchObject({ code: "reconnect_required" });
    const rejectedSession = await otherTab.getSession();

    expect(rejectedSession.data.session?.local_revision).toBe(updatedSession?.local_revision);
    expect(otherTab.getCloudStatus()).toBe("reconnect_required");
    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!)).toMatchObject({
      cloudStatus: "reconnect_required",
      refreshRejected: true,
      sessionRevision: updatedSession?.local_revision,
    });
    await expect(otherTab.getRequestSession(original.access_token)).rejects.toMatchObject({ code: "reconnect_required" });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(updatingFetch).toHaveBeenCalledOnce();
    expect(updatingFetch.mock.calls[0][0]).toBe(`${API_URL}/v1/auth/session/password`);
    expect(rejectedFetch).toHaveBeenCalledOnce();
    expect(rejectedFetch.mock.calls[0][0]).toBe(`${API_URL}/v1/auth/session/refresh`);
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it("retains a successful rotation when the first storage read after the response is blocked", async () => {
    const original = storedSession();
    const rotated = storedSession({ revision: 1 });
    seedSession(original);
    const serverResponse = deferredResponse();
    const fetchMock = vi.fn<typeof fetch>().mockReturnValueOnce(serverResponse.promise);
    const client = createClient(fetchMock);
    const originalRequest = await client.getRequestSession(original.access_token);
    const pending = settle(client.refreshRequestSession(originalRequest));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    const storage = localStorage;
    const getItem = Storage.prototype.getItem;
    const reads = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      if (this === storage && key === SESSION_STORAGE_KEY) {
        throw new DOMException("Session storage became unreadable after rotation.", "SecurityError");
      }
      return getItem.call(this, key);
    });

    serverResponse.resolve(sessionResponse(rotated));
    const failed = await pending;

    expect(failed.error).toEqual(expect.objectContaining({ code: "unavailable", message: expect.stringMatching(/storage/i) }));
    expect(JSON.parse(getItem.call(storage, SESSION_STORAGE_KEY)!)).toMatchObject({ refresh_token: original.refresh_token });
    expect(client.getCloudStatus()).toBe("unavailable");
    expect(client.getLocalUser()?.id).toBe(USER_ID);
    reads.mockRestore();

    const repaired = await client.getSession();

    expect(repaired.error).toBeNull();
    expect(repaired.data.session?.refresh_token).toBe(rotated.refresh_token);
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!)).toMatchObject({ refresh_token: rotated.refresh_token });
    expect((await client.getRequestSession(original.access_token)).accessToken).toBe(rotated.access_token);
    expect(client.isRequestSessionCurrent(originalRequest)).toBe(true);
    expect(client.getCloudStatus()).toBe("available");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ refreshToken: original.refresh_token });
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it.each(["connection", "response body"] as const)("recovers when the %s is lost after the server rotates tokens", async (lostPart) => {
    const original = storedSession({ expiresAt: Math.floor(Date.now() / 1000) - 1 });
    const recovered = storedSession({ revision: 1 });
    seedSession(original);
    let serverRotated = false;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      if (serverRotated) return sessionResponse(recovered);
      serverRotated = true;
      if (lostPart === "connection") throw new TypeError("The connection ended after server-side rotation.");
      const partialResponse = sessionResponse(recovered);
      vi.spyOn(partialResponse, "text").mockRejectedValue(new TypeError("The response stream was interrupted."));
      return partialResponse;
    });
    const client = createClient(fetchMock);
    const listener = vi.fn();
    client.onAuthStateChange(listener);

    const initial = await client.getSession();

    expect(serverRotated).toBe(true);
    expect(initial.error?.message).toBe("Authentication is temporarily unavailable.");
    expect(initial.data.session?.refresh_token).toBe(original.refresh_token);
    expect(client.getCloudStatus()).toBe("unavailable");
    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).refreshRejected).not.toBe(true);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    // Model the provider returning its active rotation for recovery of the old
    // credential; this tests client handling, not a hosted token-reuse policy.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(url).toBe(`${API_URL}/v1/auth/session/refresh`);
      expect(JSON.parse(options?.body as string)).toEqual({ refreshToken: original.refresh_token });
    }
    expect((await client.getSession()).error).toBeNull();
    expect((await client.getSession()).data.session?.access_token).toBe(recovered.access_token);
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).refresh_token).toBe(recovered.refresh_token);
    expect(client.getCloudStatus()).toBe("available");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
    expect(listener).not.toHaveBeenCalledWith("SIGNED_OUT", null);
  });
});
