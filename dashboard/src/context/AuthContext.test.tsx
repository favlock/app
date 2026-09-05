import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";
import type { AuthChangeEvent, AuthSession } from "../lib/favLockAuth";
import { captureLocalVaultWork } from "../lib/localVaultWork";
import { useBookmarkStore } from "../store/bookmarkStore";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), getLocalUser: vi.fn(), getCloudStatus: vi.fn(), getConnectionError: vi.fn(), isLocalAccountInvalidated: vi.fn(), signOut: vi.fn(), onAuthStateChange: vi.fn(),
  clearKey: vi.fn(), lockKey: vi.fn(), triggerUnlock: vi.fn(), clearBookmarks: vi.fn(), clearContent: vi.fn(), hydrate: vi.fn(), clearQueries: vi.fn(),
  fetchQuery: vi.fn(), clearDrafts: vi.fn(), clearImportRecovery: vi.fn(), updateAccountProfile: vi.fn(), invalidateQueries: vi.fn(),
}));
vi.mock("../lib/favLockAuth", () => ({
  isLocalOnlyUser: (user: { local_only?: boolean } | null) => user?.local_only === true,
  favLockAuth: {
  getSession: mocks.getSession, getLocalUser: mocks.getLocalUser, getCloudStatus: mocks.getCloudStatus,
  getConnectionError: mocks.getConnectionError,
  isLocalAccountInvalidated: mocks.isLocalAccountInvalidated, signOut: mocks.signOut,
  onAuthStateChange: mocks.onAuthStateChange, startCrossTabSynchronization: () => () => {},
  },
}));
vi.mock("../lib/localVault", () => ({ clearLocalVault: vi.fn() }));
vi.mock("./useEncryption", () => ({ useEncryption: () => ({ clearKey: mocks.clearKey, lockKey: mocks.lockKey, cryptoKey: null, keyLoading: false, triggerUnlock: mocks.triggerUnlock, decryptField: async (value: string) => value }) }));
vi.mock("../lib/bookmarkCache", () => ({
  getBookmarkCacheMeta: async () => ({ lastSyncedAt: "2026-08-27T00:00:00.000Z" }),
  getLibraryContentCacheMeta: async () => ({ lastSyncedAt: "2026-08-27T00:00:00.000Z" }),
  clearBookmarkCacheForUser: mocks.clearBookmarks, clearLibraryContentCacheForUser: mocks.clearContent,
}));
vi.mock("../lib/entryDrafts", () => ({ clearEntryDraftsForUser: mocks.clearDrafts }));
vi.mock("../lib/importRecovery", () => ({ clearImportRecoveryJournal: mocks.clearImportRecovery }));
vi.mock("../lib/hydrateLibraryQueryCache", () => ({ hydrateLibraryQueryCache: mocks.hydrate }));
vi.mock("../lib/queryClient", () => ({ queryClient: { clear: mocks.clearQueries, fetchQuery: mocks.fetchQuery, invalidateQueries: mocks.invalidateQueries } }));
vi.mock("../lib/accountSettingsApi", () => ({ updateAccountProfile: mocks.updateAccountProfile }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function createSession(accessToken: string): AuthSession {
  return {
    access_token: accessToken,
    refresh_token: "fake-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: "local-user",
      email: "local@example.test",
      created_at: "2026-08-27T00:00:00.000Z",
      user_metadata: {},
      app_metadata: {},
    },
  };
}

type SessionResult = {
  data: { session: AuthSession | null };
  error: Error | null;
};

describe("local routing through cloud failure", () => {
  let root: Root;
  let container: HTMLDivElement;
  let callback: (event: AuthChangeEvent, session: AuthSession | null) => void;
  let auth: ReturnType<typeof useAuth>;
  function Probe() {
    auth = useAuth();
    const { user, session, cloudStatus, loading, libraryCacheHydrating, bookmarkCacheSyncedAt, connectionError } = auth;
    return <span data-token={session?.access_token} data-connection-error={connectionError ?? ""} data-loading={loading} data-hydrating={libraryCacheHydrating}>{user?.id}|{session ? "cloud" : "local"}|{cloudStatus}|{bookmarkCacheSyncedAt}</span>;
  }
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearDrafts.mockReset().mockResolvedValue(undefined);
    mocks.clearKey.mockReset().mockResolvedValue(undefined);
    mocks.clearImportRecovery.mockReset();
    mocks.updateAccountProfile.mockReset().mockResolvedValue({});
    localStorage.clear();
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.fetchQuery.mockResolvedValue({ first_name: "Local" });
    mocks.getLocalUser.mockReturnValue({ id: "local-user" });
    mocks.getCloudStatus.mockReturnValue("offline");
    mocks.getConnectionError.mockReturnValue(null);
    mocks.isLocalAccountInvalidated.mockReturnValue(false);
    mocks.signOut.mockResolvedValue({ data: {}, error: null });
    mocks.onAuthStateChange.mockImplementation((listener) => {
      callback = listener;
      return { data: { subscription: { unsubscribe() {} } } };
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

  it.each([
    [null, {}, { firstName: "", lastName: "" }],
    [null, { first_name: "Ada", last_name: "Lovelace" }, { firstName: "Ada", lastName: "Lovelace" }],
    [{ first_name: "", last_name: "" }, {}, null],
    [{ first_name: "Existing", last_name: "Name" }, {}, null],
    [{ first_name: "Existing", last_name: "" }, { first_name: "Other", last_name: "Name" }, null],
  ])("prepares optional profile names without replacing existing account data (%#)", async (profile, metadata, expectedWrite) => {
    const fresh = createSession("fake-current-token");
    fresh.user.user_metadata = metadata;
    mocks.getSession.mockResolvedValue({ data: { session: fresh }, error: null });
    mocks.getLocalUser.mockReturnValue(fresh.user);
    mocks.getCloudStatus.mockReturnValue("available");
    mocks.fetchQuery.mockResolvedValue(profile);
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    if (expectedWrite) {
      expect(mocks.updateAccountProfile).toHaveBeenCalledExactlyOnceWith(fresh.access_token, expectedWrite);
    } else {
      expect(mocks.updateAccountProfile).not.toHaveBeenCalled();
    }
    expect(mocks.clearKey).not.toHaveBeenCalled();
    expect(mocks.clearBookmarks).not.toHaveBeenCalled();
  });

  it.each(["offline", "restricted", "reconnect_required", "unavailable"])("keeps cached local routing during %s without cleanup", async (status) => {
    await act(async () => { root.render(<AuthProvider><Probe /></AuthProvider>); });
    mocks.getCloudStatus.mockReturnValue(status);
    await act(async () => { callback("SESSION_STALE", null); });
    expect(container.textContent).toContain(`local-user|local|${status}|2026-08-27`);
    expect(mocks.hydrate).toHaveBeenCalled();
    expect(mocks.clearKey).not.toHaveBeenCalled();
    expect(mocks.clearBookmarks).not.toHaveBeenCalled();
    expect(mocks.clearContent).not.toHaveBeenCalled();
    expect(mocks.clearDrafts).not.toHaveBeenCalled();
    expect(mocks.clearQueries).not.toHaveBeenCalled();
  });

  it("still clears local data on an explicit sign-out event", async () => {
    await act(async () => { root.render(<AuthProvider><Probe /></AuthProvider>); });
    mocks.getLocalUser.mockReturnValue(null);
    mocks.getCloudStatus.mockReturnValue("signed_out");
    await act(async () => { callback("SIGNED_OUT", null); });
    expect(mocks.clearKey).toHaveBeenCalledOnce();
    expect(mocks.clearBookmarks).toHaveBeenCalledWith("local-user");
    expect(mocks.clearContent).toHaveBeenCalledWith("local-user");
    expect(mocks.clearDrafts).toHaveBeenCalledExactlyOnceWith("local-user");
    expect(mocks.clearImportRecovery).toHaveBeenCalledExactlyOnceWith("local-user");
    expect(container.textContent).not.toContain("local-user");
  });

  it.each<AuthChangeEvent>(["SIGNED_IN", "TOKEN_REFRESHED", "PASSWORD_RECOVERY", "USER_UPDATED"])("does not overwrite %s with a delayed initialization failure", async (event) => {
    const initial = deferred<SessionResult>();
    const fresh = createSession("fake-fresh-access-token");
    mocks.getSession.mockReturnValue(initial.promise);
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));

    mocks.getLocalUser.mockReturnValue(fresh.user);
    mocks.getCloudStatus.mockReturnValue("available");
    await act(async () => callback(event, fresh));
    await act(async () => initial.resolve({
      data: { session: createSession("fake-old-access-token") },
      error: new Error("Your session has expired. Sign in again."),
    }));

    expect(container.textContent).toContain("local-user|cloud|available");
    expect(container.querySelector("span")?.dataset.token).toBe("fake-fresh-access-token");
    expect(container.querySelector("span")?.dataset.connectionError).toBe("");
    expect(mocks.clearKey).not.toHaveBeenCalled();
    expect(mocks.clearBookmarks).not.toHaveBeenCalled();
  });

  it("locks the source key when an explicit merge signs into a different account", async () => {
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    const cloudSession = createSession("cloud-access-token");
    cloudSession.user.id = "cloud-user";
    mocks.getLocalUser.mockReturnValue(cloudSession.user);
    mocks.getCloudStatus.mockReturnValue("available");

    await act(async () => callback("SIGNED_IN", cloudSession));

    expect(mocks.clearKey).toHaveBeenCalledOnce();
    expect(mocks.clearQueries).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("cloud-user|cloud|available");
  });

  it.each<AuthChangeEvent>(["INITIAL_SESSION", "SESSION_STALE"])("preserves a genuine initialization error after %s", async (event) => {
    const initial = deferred<SessionResult>();
    mocks.getSession.mockReturnValue(initial.promise);
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    mocks.getCloudStatus.mockReturnValue("reconnect_required");
    await act(async () => callback(event, null));
    await act(async () => initial.resolve({
      data: { session: null },
      error: new Error("The sign-in link is invalid or has expired."),
    }));

    expect(container.querySelector("span")?.dataset.connectionError).toBe("The sign-in link is invalid or has expired.");
    expect(container.textContent).toContain("local-user|local|reconnect_required");
    expect(mocks.clearKey).not.toHaveBeenCalled();
  });

  it.each<AuthChangeEvent>(["SIGNED_IN", "TOKEN_REFRESHED", "PASSWORD_RECOVERY", "USER_UPDATED"])("clears an earlier initialization error after %s", async (event) => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: new Error("An earlier authentication attempt failed.") });
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    expect(container.querySelector("span")?.dataset.connectionError).not.toBe("");

    const fresh = createSession("fake-recovered-access-token");
    mocks.getLocalUser.mockReturnValue(fresh.user);
    mocks.getCloudStatus.mockReturnValue("available");
    await act(async () => callback(event, fresh));

    expect(container.querySelector("span")?.dataset.connectionError).toBe("");
    expect(container.querySelector("span")?.dataset.token).toBe("fake-recovered-access-token");
  });

  it("does not restore initialization state after explicit sign-out", async () => {
    const initial = deferred<SessionResult>();
    const oldSession = createSession("fake-signed-out-access-token");
    mocks.getSession.mockReturnValue(initial.promise);
    mocks.getLocalUser.mockReturnValue(oldSession.user);
    mocks.getCloudStatus.mockReturnValue("available");
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    await act(async () => callback("INITIAL_SESSION", oldSession));

    mocks.getLocalUser.mockReturnValue(null);
    mocks.getCloudStatus.mockReturnValue("signed_out");
    await act(async () => callback("SIGNED_OUT", null));
    await act(async () => initial.resolve({
      data: { session: oldSession },
      error: new Error("A stale authentication request failed."),
    }));

    expect(container.querySelector("span")?.dataset.token).toBeUndefined();
    expect(container.querySelector("span")?.dataset.connectionError).toBe("");
    expect(container.textContent).toContain("|local|signed_out");
    expect(mocks.clearKey).toHaveBeenCalledOnce();
    expect(mocks.clearBookmarks).toHaveBeenCalledWith("local-user");
    expect(mocks.clearContent).toHaveBeenCalledWith("local-user");
    expect(mocks.clearDrafts).toHaveBeenCalledExactlyOnceWith("local-user");
  });

  it("settles startup with a safe error when browser storage is denied", async () => {
    localStorage.setItem("local-vault-sentinel", "preserved");
    const readStorage = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Private storage diagnostic detail", "SecurityError");
    });
    const removeStorage = vi.spyOn(Storage.prototype, "removeItem");
    mocks.getSession.mockImplementation(async () => {
      localStorage.getItem("favlock.auth.session.v1");
      return { data: { session: null }, error: null };
    });

    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));

    const state = container.querySelector("span")?.dataset;
    expect(state?.loading).toBe("false");
    expect(state?.hydrating).toBe("false");
    expect(state?.connectionError).toBe("Could not open your saved session. Check this browser's storage settings and reload FavLock.");
    expect(state?.connectionError).not.toContain("Private storage diagnostic");
    expect(removeStorage).not.toHaveBeenCalled();
    expect(mocks.clearKey).not.toHaveBeenCalled();
    expect(mocks.clearBookmarks).not.toHaveBeenCalled();
    expect(mocks.clearContent).not.toHaveBeenCalled();
    expect(mocks.clearDrafts).not.toHaveBeenCalled();
    expect(mocks.clearImportRecovery).not.toHaveBeenCalled();
    expect(mocks.clearQueries).not.toHaveBeenCalled();
    readStorage.mockRestore();
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it("keeps an already opened local account when initialization rejects", async () => {
    const initial = deferred<SessionResult>();
    mocks.getSession.mockReturnValue(initial.promise);
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    await act(async () => callback("INITIAL_SESSION", null));
    expect(container.textContent).toContain("local-user|local|offline");

    await act(async () => initial.reject(new Error("Private initialization details")));

    expect(container.textContent).toContain("local-user|local|unavailable");
    expect(container.querySelector("span")?.dataset.loading).toBe("false");
    expect(container.querySelector("span")?.dataset.connectionError).toContain("Check this browser's storage settings");
    expect(container.querySelector("span")?.dataset.connectionError).not.toContain("Private initialization");
    expect(mocks.clearKey).not.toHaveBeenCalled();
    expect(mocks.clearBookmarks).not.toHaveBeenCalled();
    expect(mocks.clearContent).not.toHaveBeenCalled();
    expect(mocks.clearDrafts).not.toHaveBeenCalled();
    expect(mocks.clearQueries).not.toHaveBeenCalled();
  });

  it.each<AuthChangeEvent>(["SIGNED_IN", "TOKEN_REFRESHED", "PASSWORD_RECOVERY", "USER_UPDATED"])("ignores a rejected initialization after %s", async (event) => {
    const initial = deferred<SessionResult>();
    const fresh = createSession("fake-new-session-after-storage-failure");
    mocks.getSession.mockReturnValue(initial.promise);
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    mocks.getLocalUser.mockReturnValue(fresh.user);
    mocks.getCloudStatus.mockReturnValue("available");
    await act(async () => callback(event, fresh));
    await act(async () => initial.reject(new DOMException("Old storage failure", "SecurityError")));

    expect(container.textContent).toContain("local-user|cloud|available");
    expect(container.querySelector("span")?.dataset.token).toBe(fresh.access_token);
    expect(container.querySelector("span")?.dataset.connectionError).toBe("");
    expect(container.querySelector("span")?.dataset.loading).toBe("false");
    expect(mocks.clearKey).not.toHaveBeenCalled();
    expect(mocks.clearBookmarks).not.toHaveBeenCalled();
  });

  it("ignores a rejected initialization after explicit sign-out", async () => {
    const initial = deferred<SessionResult>();
    mocks.getSession.mockReturnValue(initial.promise);
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    await act(async () => callback("INITIAL_SESSION", null));
    mocks.getLocalUser.mockReturnValue(null);
    mocks.getCloudStatus.mockReturnValue("signed_out");
    await act(async () => callback("SIGNED_OUT", null));
    await act(async () => initial.reject(new Error("Old initialization failure")));

    expect(container.textContent).toContain("|local|signed_out");
    expect(container.querySelector("span")?.dataset.connectionError).toBe("");
    expect(container.querySelector("span")?.dataset.loading).toBe("false");
    expect(mocks.clearKey).toHaveBeenCalledOnce();
    expect(mocks.clearBookmarks).toHaveBeenCalledWith("local-user");
    expect(mocks.clearContent).toHaveBeenCalledWith("local-user");
    expect(mocks.clearDrafts).toHaveBeenCalledExactlyOnceWith("local-user");
    expect(mocks.clearImportRecovery).toHaveBeenCalledExactlyOnceWith("local-user");
  });

  it("handles a rejected initialization after the provider unmounts", async () => {
    const initial = deferred<SessionResult>();
    mocks.getSession.mockReturnValue(initial.promise);
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    await act(async () => root.render(null));
    await act(async () => initial.reject(new Error("Old initialization failure")));

    expect(container.textContent).toBe("");
    expect(mocks.clearKey).not.toHaveBeenCalled();
    expect(mocks.clearBookmarks).not.toHaveBeenCalled();
  });

  it("locks an invalidated account without deleting the newer shared account's data", async () => {
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    useBookmarkStore.getState().setSelectedFolderId("old-account-folder");
    useBookmarkStore.getState().setSearchQuery("fake old account search");
    const sharedValues = {
      "favlock.auth.session.v1": "fake-new-account-credentials",
      "favlock.local-profile.v1": "fake-new-account-profile",
      "favlock.local-verifier.v1:local-user": "enc:fake-current-verifier",
      themeVariant: "new-account-theme",
    };
    for (const [key, value] of Object.entries(sharedValues)) localStorage.setItem(key, value);
    sessionStorage.setItem("zk_enc_key", "fake-session-key-sentinel");
    const assertCurrent = captureLocalVaultWork("local-user");
    const removeStorage = vi.spyOn(Storage.prototype, "removeItem");
    mocks.getLocalUser.mockReturnValue(null);
    mocks.getCloudStatus.mockReturnValue("signed_out");

    await act(async () => callback("LOCAL_ACCOUNT_INVALIDATED", null));

    expect(container.textContent).toContain("|local|signed_out");
    expect(container.textContent).not.toContain("local-user");
    expect(container.querySelector("span")?.dataset.connectionError).toBe("Your account changed in another tab. Reload to continue.");
    expect(container.querySelector("span")?.dataset.loading).toBe("false");
    expect(container.querySelector("span")?.dataset.hydrating).toBe("false");
    expect(mocks.lockKey).toHaveBeenCalledOnce();
    expect(mocks.clearQueries).toHaveBeenCalledOnce();
    expect(useBookmarkStore.getState().selectedFolderId).toBeNull();
    expect(useBookmarkStore.getState().searchQuery).toBe("");
    expect(assertCurrent).toThrow("Local vault work was cancelled.");
    expect(removeStorage).not.toHaveBeenCalled();
    expect(mocks.clearKey).not.toHaveBeenCalled();
    expect(mocks.clearBookmarks).not.toHaveBeenCalled();
    expect(mocks.clearContent).not.toHaveBeenCalled();
    expect(mocks.clearDrafts).not.toHaveBeenCalled();
    for (const [key, value] of Object.entries(sharedValues)) expect(localStorage.getItem(key)).toBe(value);
    expect(sessionStorage.getItem("zk_enc_key")).toBe("fake-session-key-sentinel");
  });

  it("still locks an invalidated account when UI preference storage throws", async () => {
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    useBookmarkStore.getState().setSearchQuery("fake old search");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });
    mocks.getLocalUser.mockReturnValue(null);
    mocks.getCloudStatus.mockReturnValue("signed_out");

    await act(async () => callback("LOCAL_ACCOUNT_INVALIDATED", null));

    expect(container.textContent).toContain("|local|signed_out");
    expect(container.querySelector("span")?.dataset.connectionError).toBe("Your account changed in another tab. Reload to continue.");
    expect(useBookmarkStore.getState().searchQuery).toBe("");
    expect(mocks.lockKey).toHaveBeenCalledOnce();
    expect(mocks.clearKey).not.toHaveBeenCalled();
  });

  it("keeps an invalidated account detached despite delayed initialization and queued auth events", async () => {
    const initial = deferred<SessionResult>();
    mocks.getSession.mockReturnValue(initial.promise);
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    await act(async () => callback("INITIAL_SESSION", null));
    mocks.getLocalUser.mockReturnValue(null);
    mocks.getCloudStatus.mockReturnValue("signed_out");
    await act(async () => callback("LOCAL_ACCOUNT_INVALIDATED", null));
    await act(async () => initial.reject(new Error("An obsolete storage error")));
    await act(async () => callback("SIGNED_OUT", null));
    const newer = createSession("fake-new-shared-account-token");
    mocks.getLocalUser.mockReturnValue(newer.user);
    mocks.getCloudStatus.mockReturnValue("available");
    await act(async () => callback("SIGNED_IN", newer));

    expect(container.textContent).toContain("|local|signed_out");
    expect(container.querySelector("span")?.dataset.token).toBeUndefined();
    expect(container.querySelector("span")?.dataset.connectionError).toBe("Your account changed in another tab. Reload to continue.");
    expect(mocks.lockKey).toHaveBeenCalledOnce();
    expect(mocks.clearKey).not.toHaveBeenCalled();
    expect(mocks.clearBookmarks).not.toHaveBeenCalled();
  });

  it("updates storage errors and clears repaired errors without a token refresh", async () => {
    const session = createSession("fake-current-access-token");
    mocks.getSession.mockResolvedValue({ data: { session }, error: null });
    mocks.getLocalUser.mockReturnValue(session.user);
    mocks.getCloudStatus.mockReturnValue("available");
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));

    mocks.getCloudStatus.mockReturnValue("unavailable");
    mocks.getConnectionError.mockReturnValue(new Error("Browser storage is unavailable. Reload to continue."));
    await act(async () => callback("SESSION_STALE", session));
    expect(container.querySelector("span")?.dataset.connectionError).toBe("Browser storage is unavailable. Reload to continue.");
    expect(container.querySelector("span")?.dataset.token).toBeUndefined();

    mocks.getCloudStatus.mockReturnValue("available");
    mocks.getConnectionError.mockReturnValue(null);
    await act(async () => callback("SESSION_STALE", session));
    expect(container.querySelector("span")?.dataset.connectionError).toBe("");
    expect(container.querySelector("span")?.dataset.token).toBe(session.access_token);
    expect(mocks.clearKey).not.toHaveBeenCalled();
    expect(mocks.clearBookmarks).not.toHaveBeenCalled();
  });

  it.each([false, true])("handles an unreadable local verifier without a cloud verification fallback (cloud session: %s)", async (hasCloudSession) => {
    localStorage.setItem("local-vault-sentinel", "preserved");
    if (hasCloudSession) {
      const session = createSession("fake-current-access-token");
      mocks.getSession.mockResolvedValue({ data: { session }, error: null });
      mocks.getLocalUser.mockReturnValue(session.user);
      mocks.getCloudStatus.mockReturnValue("available");
    }
    const read = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name) {
      if (name === "favlock.local-verifier.v1:local-user") {
        throw new DOMException("Private verifier diagnostic", "SecurityError");
      }
      return read.call(this, name);
    });

    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));

    expect(container.textContent).toContain("local-user|");
    expect(auth.loading).toBe(false);
    expect(auth.connectionError).toBe("Could not open your saved session. Check this browser's storage settings and reload FavLock.");
    // An online account still reads profile names, but must not add a verifier probe.
    expect(mocks.fetchQuery).toHaveBeenCalledTimes(hasCloudSession ? 1 : 0);
    expect(mocks.triggerUnlock).not.toHaveBeenCalled();
    expect(mocks.clearKey).not.toHaveBeenCalled();
    expect(mocks.clearBookmarks).not.toHaveBeenCalled();
    expect(mocks.clearContent).not.toHaveBeenCalled();
    expect(mocks.clearDrafts).not.toHaveBeenCalled();
    expect(localStorage.getItem("local-vault-sentinel")).toBe("preserved");
  });

  it("does not delete a replacement account's shared data when signOut detects invalidation", async () => {
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    const sharedValues = {
      "favlock.auth.session.v1": "fake-replacement-session",
      "favlock.local-profile.v1": "fake-replacement-profile",
      "favlock.local-verifier.v1:local-user": "enc:fake-replacement-verifier",
      themeVariant: "new-account-theme",
    };
    for (const [key, value] of Object.entries(sharedValues)) localStorage.setItem(key, value);
    sessionStorage.setItem("zk_enc_key", "fake-new-session-key-sentinel");
    const removeStorage = vi.spyOn(Storage.prototype, "removeItem");
    mocks.signOut.mockImplementation(() => {
      mocks.isLocalAccountInvalidated.mockReturnValue(true);
      mocks.getLocalUser.mockReturnValue(null);
      mocks.getCloudStatus.mockReturnValue("signed_out");
      queueMicrotask(() => callback("LOCAL_ACCOUNT_INVALIDATED", null));
      return Promise.resolve({ data: {}, error: new Error("Your account changed in another tab. Reload to continue.") });
    });

    await act(async () => {
      await expect(auth.signOut()).rejects.toThrow("Your account changed in another tab. Reload to continue.");
    });

    expect(mocks.lockKey).toHaveBeenCalledOnce();
    expect(mocks.clearKey).not.toHaveBeenCalled();
    expect(mocks.clearBookmarks).not.toHaveBeenCalled();
    expect(mocks.clearContent).not.toHaveBeenCalled();
    expect(mocks.clearDrafts).not.toHaveBeenCalled();
    expect(removeStorage).not.toHaveBeenCalled();
    for (const [key, value] of Object.entries(sharedValues)) expect(localStorage.getItem(key)).toBe(value);
    expect(sessionStorage.getItem("zk_enc_key")).toBe("fake-new-session-key-sentinel");
    expect(auth.user).toBeNull();
    expect(auth.connectionError).toBe("Your account changed in another tab. Reload to continue.");
  });

  it.each([false, true])("still clears data for an authorized explicit signOut (server failure: %s)", async (serverFailure) => {
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    const logoutError = serverFailure ? new Error("Authentication is temporarily unavailable.") : null;
    mocks.signOut.mockImplementation(() => {
      mocks.getLocalUser.mockReturnValue(null);
      mocks.getCloudStatus.mockReturnValue("signed_out");
      queueMicrotask(() => callback("SIGNED_OUT", null));
      return Promise.resolve({ data: {}, error: logoutError });
    });

    await act(async () => {
      if (logoutError) await expect(auth.signOut()).rejects.toThrow(logoutError.message);
      else await auth.signOut();
    });

    expect(mocks.clearKey).toHaveBeenCalledOnce();
    expect(mocks.clearBookmarks).toHaveBeenCalledWith("local-user");
    expect(mocks.clearContent).toHaveBeenCalledWith("local-user");
    expect(mocks.clearDrafts).toHaveBeenCalledExactlyOnceWith("local-user");
    expect(auth.user).toBeNull();
    expect(auth.loading).toBe(false);
  });

  it("does not run a queued SIGNED_OUT cleanup after core invalidation already occurred", async () => {
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    mocks.isLocalAccountInvalidated.mockReturnValue(true);
    mocks.getLocalUser.mockReturnValue(null);
    mocks.getCloudStatus.mockReturnValue("signed_out");

    await act(async () => {
      callback("SIGNED_OUT", null);
      callback("LOCAL_ACCOUNT_INVALIDATED", null);
    });

    expect(mocks.clearKey).not.toHaveBeenCalled();
    expect(mocks.clearBookmarks).not.toHaveBeenCalled();
    expect(mocks.clearContent).not.toHaveBeenCalled();
    expect(mocks.clearDrafts).not.toHaveBeenCalled();
    expect(mocks.lockKey).toHaveBeenCalledOnce();
    expect(auth.connectionError).toBe("Your account changed in another tab. Reload to continue.");
  });
});
