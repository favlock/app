import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";
import type { AuthChangeEvent, AuthSession } from "../lib/favLockAuth";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), getLocalUser: vi.fn(), getCloudStatus: vi.fn(), onAuthStateChange: vi.fn(),
  clearKey: vi.fn(), clearBookmarks: vi.fn(), clearContent: vi.fn(), hydrate: vi.fn(), clearQueries: vi.fn(),
}));
vi.mock("../lib/favLockAuth", () => ({ favLockAuth: {
  getSession: mocks.getSession, getLocalUser: mocks.getLocalUser, getCloudStatus: mocks.getCloudStatus,
  onAuthStateChange: mocks.onAuthStateChange, startCrossTabSynchronization: () => () => {},
} }));
vi.mock("./useEncryption", () => ({ useEncryption: () => ({ clearKey: mocks.clearKey, cryptoKey: null, keyLoading: false, triggerUnlock: () => {}, decryptField: async (value: string) => value }) }));
vi.mock("../lib/bookmarkCache", () => ({
  getBookmarkCacheMeta: async () => ({ lastSyncedAt: "2026-08-27T00:00:00.000Z" }),
  getLibraryContentCacheMeta: async () => ({ lastSyncedAt: "2026-08-27T00:00:00.000Z" }),
  clearBookmarkCacheForUser: mocks.clearBookmarks, clearLibraryContentCacheForUser: mocks.clearContent,
}));
vi.mock("../lib/hydrateLibraryQueryCache", () => ({ hydrateLibraryQueryCache: mocks.hydrate }));
vi.mock("../lib/queryClient", () => ({ queryClient: { clear: mocks.clearQueries } }));

describe("local routing through cloud failure", () => {
  let root: Root;
  let container: HTMLDivElement;
  let callback: (event: AuthChangeEvent, session: AuthSession | null) => void;
  function Probe() {
    const { user, session, cloudStatus, bookmarkCacheSyncedAt } = useAuth();
    return <span>{user?.id}|{session ? "cloud" : "local"}|{cloudStatus}|{bookmarkCacheSyncedAt}</span>;
  }
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.getLocalUser.mockReturnValue({ id: "local-user" });
    mocks.getCloudStatus.mockReturnValue("offline");
    mocks.onAuthStateChange.mockImplementation((listener) => {
      callback = listener;
      return { data: { subscription: { unsubscribe() {} } } };
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it.each(["offline", "restricted", "reconnect_required", "unavailable"])("keeps cached local routing during %s without cleanup", async (status) => {
    await act(async () => { root.render(<AuthProvider><Probe /></AuthProvider>); });
    mocks.getCloudStatus.mockReturnValue(status);
    await act(async () => { callback("SESSION_STALE", null); });
    expect(container.textContent).toContain(`local-user|local|${status}|2026-08-27`);
    expect(mocks.hydrate).toHaveBeenCalled();
    expect(mocks.clearKey).not.toHaveBeenCalled();
    expect(mocks.clearBookmarks).not.toHaveBeenCalled();
    expect(mocks.clearContent).not.toHaveBeenCalled();
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
    expect(container.textContent).not.toContain("local-user");
  });
});
