import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FavLockAuthClient as AuthClient, AuthSession } from "./favLockAuth";

const singleton = vi.hoisted(() => ({ client: null as AuthClient | null }));

vi.mock("./favLockAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./favLockAuth")>();
  return {
    ...actual,
    get favLockAuth() {
      if (!singleton.client) throw new Error("The integration auth client was not initialized.");
      return singleton.client;
    },
  };
});

vi.mock("./appUrls", () => ({
  API_URL: "https://api.favlock.example",
  DASHBOARD_URL: "https://dashboard.favlock.example",
}));

import { postAuthenticatedJson } from "./authenticatedApi";
import { CloudAccessError } from "./cloudAccess";
import { FavLockAuthClient, LOCAL_PROFILE_STORAGE_KEY } from "./favLockAuth";

const SESSION_STORAGE_KEY = "favlock.auth.session.v1";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const BOOKMARK_PATH = "/v1/bookmarks";
const REFRESH_PATH = "/v1/auth/session/refresh";
const ciphertext = { encryptedTitle: "enc:fake-test-title", encryptedUrl: "enc:fake-test-url" };
const failureMessage = "The bookmark could not be saved.";
const fetchMock = vi.fn<typeof fetch>();
let client: FavLockAuthClient;
let stopSynchronization: () => void;

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function apiSession(accessToken = "rotated-access", refreshToken = "rotated-refresh", userId = USER_ID) {
  return {
    accessToken, refreshToken, expiresIn: 3600, expiresAt: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: userId, email: "test@example.com", createdAt: "2026-08-20T08:00:00.000Z",
      firstName: "Test", lastName: "Account", passwordSignInEnabled: true,
    },
  };
}

function seedLocalSession(): void {
  const session: AuthSession = {
    access_token: "original-access", refresh_token: "original-refresh", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer",
    user: {
      id: USER_ID, email: "test@example.com", created_at: "2026-08-20T08:00:00.000Z",
      user_metadata: {}, app_metadata: {},
    },
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  localStorage.setItem("local-vault-sentinel", "preserved");
}

function callsFor(path: string) {
  return fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === path);
}

function saveBookmark(body = ciphertext): Promise<unknown> {
  return postAuthenticatedJson(BOOKMARK_PATH, "original-access", body, failureMessage);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/library");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  fetchMock.mockReset().mockImplementation(() => { throw new Error("Unexpected network request."); });
  vi.stubGlobal("fetch", fetchMock);
  client = new FavLockAuthClient({
    apiUrl: "https://api.favlock.example", authUrl: "https://auth.favlock.example",
    dashboardUrl: "https://dashboard.favlock.example", fetchImplementation: fetchMock,
    navigate: vi.fn(),
  });
  singleton.client = client;
  stopSynchronization = client.startCrossTabSynchronization();
});

afterEach(() => {
  stopSynchronization();
  client.dispose();
  singleton.client = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("authenticated API with the real session client", () => {
  it("renews a suspended session before sending an encrypted mutation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T20:00:00.000Z"));
    seedLocalSession();
    await client.initialize();
    vi.setSystemTime(new Date("2026-08-28T08:00:00.000Z"));
    fetchMock.mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === REFRESH_PATH) return response({ data: { session: apiSession() } });
      if (path === BOOKMARK_PATH) return response({ data: { id: "fake-bookmark-id" } }, 201);
      throw new Error("Unexpected network request.");
    });

    await expect(saveBookmark()).resolves.toEqual({ data: { id: "fake-bookmark-id" } });

    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      REFRESH_PATH, BOOKMARK_PATH,
    ]);
    expect(callsFor(BOOKMARK_PATH)[0][1]).toMatchObject({
      method: "POST", body: JSON.stringify(ciphertext),
      headers: { Authorization: "Bearer rotated-access" },
    });
    expect(client.getCloudStatus()).toBe("available");
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it("renews after a data 401 and replays the unchanged ciphertext once", async () => {
    seedLocalSession();
    fetchMock.mockImplementation(async (input, options) => {
      const path = new URL(String(input)).pathname;
      if (path === REFRESH_PATH) return response({ data: { session: apiSession() } });
      if (path === BOOKMARK_PATH) {
        return new Headers(options?.headers).get("Authorization") === "Bearer original-access"
          ? response({ error: { message: "Expired access token." } }, 401)
          : response({ data: { id: "fake-bookmark-id" } }, 201);
      }
      throw new Error("Unexpected network request.");
    });

    await expect(saveBookmark()).resolves.toEqual({ data: { id: "fake-bookmark-id" } });

    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      BOOKMARK_PATH, REFRESH_PATH, BOOKMARK_PATH,
    ]);
    for (const [, options] of callsFor(BOOKMARK_PATH)) {
      expect(options?.body).toBe(JSON.stringify(ciphertext));
    }
    expect(callsFor(BOOKMARK_PATH)[1][1]?.headers).toMatchObject({ Authorization: "Bearer rotated-access" });
    expect(client.getCloudStatus()).toBe("available");
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).refresh_token).toBe("rotated-refresh");
  });

  it("shares one refresh across concurrent data 401s without disconnecting", async () => {
    seedLocalSession();
    const refresh = deferredResponse();
    fetchMock.mockImplementation(async (input, options) => {
      const path = new URL(String(input)).pathname;
      if (path === REFRESH_PATH) return refresh.promise;
      if (path === BOOKMARK_PATH) {
        return new Headers(options?.headers).get("Authorization") === "Bearer original-access"
          ? response({ error: { message: "Expired access token." } }, 401)
          : response({ data: { saved: true } }, 201);
      }
      throw new Error("Unexpected network request.");
    });
    const secondCiphertext = { ...ciphertext, encryptedTitle: "enc:fake-second-title" };
    const saves = Promise.all([saveBookmark(), saveBookmark(secondCiphertext)]);
    await vi.waitFor(() => expect(callsFor(REFRESH_PATH)).toHaveLength(1));
    expect(callsFor(BOOKMARK_PATH)).toHaveLength(2);
    expect(client.getCloudStatus()).toBe("available");

    refresh.resolve(response({ data: { session: apiSession() } }));
    await expect(saves).resolves.toEqual([{ data: { saved: true } }, { data: { saved: true } }]);

    expect(callsFor(REFRESH_PATH)).toHaveLength(1);
    const bookmarkCalls = callsFor(BOOKMARK_PATH);
    expect(bookmarkCalls).toHaveLength(4);
    expect(bookmarkCalls.filter(([, options]) => new Headers(options?.headers).get("Authorization") === "Bearer rotated-access")).toHaveLength(2);
    expect(bookmarkCalls.filter(([, options]) => options?.body === JSON.stringify(ciphertext))).toHaveLength(2);
    expect(bookmarkCalls.filter(([, options]) => options?.body === JSON.stringify(secondCiphertext))).toHaveLength(2);
    expect(client.getCloudStatus()).toBe("available");
  });

  it("stops after refresh rejection without replaying data or removing the local account", async () => {
    seedLocalSession();
    fetchMock.mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === BOOKMARK_PATH) return response({ error: { message: "Expired access token." } }, 401);
      if (path === REFRESH_PATH) return response({ error: { message: "Session was revoked." } }, 401);
      throw new Error("Unexpected network request.");
    });

    const save = saveBookmark();
    await expect(save).rejects.toBeInstanceOf(CloudAccessError);
    await expect(save).rejects.toMatchObject({ code: "reconnect_required" });

    expect(callsFor(BOOKMARK_PATH)).toHaveLength(1);
    expect(callsFor(REFRESH_PATH)).toHaveLength(1);
    expect(client.getCloudStatus()).toBe("reconnect_required");
    expect(client.getLocalUser()?.id).toBe(USER_ID);
    expect((await client.getSession()).data.session?.refresh_token).toBe("original-refresh");
    expect(JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)!).refreshRejected).toBe(true);
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it.each([
    { phase: "preflight", otherAccount: false },
    { phase: "preflight", otherAccount: true },
    { phase: "data 401", otherAccount: false },
    { phase: "data 401", otherAccount: true },
  ])("does not mutate under a newer login during $phase refresh (different account: $otherAccount)", async ({ phase, otherAccount }) => {
    seedLocalSession();
    await client.initialize();
    if (phase === "preflight") vi.spyOn(Date, "now").mockReturnValue(Date.now() + 12 * 60 * 60 * 1000);
    const refresh = deferredResponse();
    const nextUserId = otherAccount ? OTHER_USER_ID : USER_ID;
    fetchMock.mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === REFRESH_PATH) return refresh.promise;
      if (path === BOOKMARK_PATH) return response({ error: { message: "Expired access token." } }, 401);
      if (path === "/v1/auth/session/logout") return response({ data: {} });
      if (path === "/v1/auth/sign-in/password") {
        return response({ data: { session: apiSession("new-login-access", "new-login-refresh", nextUserId) } });
      }
      throw new Error("Unexpected network request.");
    });
    const save = saveBookmark().then(() => null, (error: unknown) => error);
    await vi.waitFor(() => expect(callsFor(REFRESH_PATH)).toHaveLength(1));
    if (otherAccount) await client.signOut();
    const login = await client.signInWithPassword({
      email: "test@example.com", password: "fake-test-password", options: { captchaToken: "fake-captcha" },
    });
    expect(login.error).toBeNull();

    refresh.resolve(response({ data: { session: apiSession() } }));
    const result = await save;

    expect(result).toBeInstanceOf(Error);
    expect(result).toMatchObject({ message: expect.stringContaining("account changed") });
    expect(callsFor(BOOKMARK_PATH)).toHaveLength(phase === "preflight" ? 0 : 1);
    expect(callsFor(BOOKMARK_PATH).some(([, options]) =>
      new Headers(options?.headers).get("Authorization") === "Bearer new-login-access")).toBe(false);
    expect(client.getCloudStatus()).toBe("available");
    expect(client.getLocalUser()?.id).toBe(nextUserId);
    expect((await client.getSession()).data.session?.refresh_token).toBe("new-login-refresh");
  });
});
