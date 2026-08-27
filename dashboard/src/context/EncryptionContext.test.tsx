import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptionProvider } from "./EncryptionContext";
import { useEncryption } from "./useEncryption";
import { importRawKey } from "../lib/encryption";
import { createLocalKeyVerifier, saveLocalKeyVerifier, matchesLocalKey } from "../lib/localKeyVerifier";

const mocks = vi.hoisted(() => ({
  load: vi.fn(), save: vi.fn(), remove: vi.fn(), user: vi.fn(), status: vi.fn(), session: vi.fn(), fetchVerifier: vi.fn(), saveVerifier: vi.fn(),
}));
vi.mock("../lib/encryption", async (original) => ({
  ...await original<typeof import("../lib/encryption")>(),
  loadKeyFromIDB: mocks.load, saveKeyToIDB: mocks.save, deleteKeyFromIDB: mocks.remove,
}));
vi.mock("../lib/favLockAuth", () => ({ favLockAuth: { getSession: mocks.session, getLocalUser: mocks.user, getCloudStatus: mocks.status } }));
vi.mock("../lib/encryptionMetadataApi", () => ({ fetchEncryptionVerifier: mocks.fetchVerifier, saveEncryptionVerifier: mocks.saveVerifier }));

describe("offline local key access", () => {
  let root: Root;
  let container: HTMLDivElement;
  let context: ReturnType<typeof useEncryption>;
  function Probe() { context = useEncryption(); return <span>{context.cryptoKey ? "unlocked" : "locked"}</span>; }
  async function mount() {
    await act(async () => { root.render(<EncryptionProvider><Probe /></EncryptionProvider>); });
    await vi.waitFor(async () => { await act(async () => {}); expect(context.keyLoading).toBe(false); });
  }
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mocks.load.mockResolvedValue(null);
    mocks.save.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);
    mocks.user.mockReturnValue({ id: "local-user" });
    mocks.status.mockReturnValue("restricted");
    mocks.session.mockResolvedValue({ data: { session: null }, error: null });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it("loads a remembered legacy key without cloud authorization and seeds a local verifier", async () => {
    const key = await importRawKey("a".repeat(32));
    mocks.load.mockResolvedValue(key);
    await mount();
    expect(container.textContent).toBe("unlocked");
    expect(context.keyRemembered).toBe(true);
    await expect(matchesLocalKey("local-user", key)).resolves.toBe(true);
    expect(mocks.fetchVerifier).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("unlocks using a matching recovery key offline without writing to the cloud", async () => {
    const key = await importRawKey("a".repeat(32));
    saveLocalKeyVerifier("local-user", await createLocalKeyVerifier(key));
    await mount();
    await act(async () => { await context.setRawKey("a".repeat(32), { rememberDevice: true }); });
    expect(container.textContent).toBe("unlocked");
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.fetchVerifier).not.toHaveBeenCalled();
    expect(mocks.saveVerifier).not.toHaveBeenCalled();
  });

  it("rejects the wrong offline key without replacing the saved key", async () => {
    saveLocalKeyVerifier("local-user", await createLocalKeyVerifier(await importRawKey("a".repeat(32))));
    await mount();
    await expect(context.setRawKey("b".repeat(32), { rememberDevice: true })).rejects.toThrow("does not match");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("preserves legacy session-storage key migration through Strict Mode replay", async () => {
    sessionStorage.setItem("zk_enc_key", "a".repeat(32));
    await act(async () => { root.render(<StrictMode><EncryptionProvider><Probe /></EncryptionProvider></StrictMode>); });
    await vi.waitFor(async () => { await act(async () => {}); expect(context.keyLoading).toBe(false); });
    expect(container.textContent).toBe("unlocked");
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem("zk_enc_key")).toBeNull();
  });

  it("fails safely when offline key verification has never been initialized", async () => {
    await mount();
    await expect(context.setRawKey("a".repeat(32))).rejects.toThrow("no saved key verifier");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("does not load a remembered key that fails the account's local proof", async () => {
    saveLocalKeyVerifier("local-user", await createLocalKeyVerifier(await importRawKey("a".repeat(32))));
    mocks.load.mockResolvedValue(await importRawKey("b".repeat(32)));
    await mount();
    expect(container.textContent).toBe("locked");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
