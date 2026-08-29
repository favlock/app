import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptionProvider } from "./EncryptionContext";
import { useEncryption } from "./useEncryption";
import { importRawKey } from "../lib/encryption";
import { createLocalKeyVerifier, saveLocalKeyVerifier, matchesLocalKey } from "../lib/localKeyVerifier";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  load: vi.fn(), save: vi.fn(), remove: vi.fn(), user: vi.fn(), status: vi.fn(), session: vi.fn(), fetchVerifier: vi.fn(), saveVerifier: vi.fn(), probe: vi.fn(), canDecrypt: vi.fn(),
}));
vi.mock("../lib/encryption", async (original) => ({
  ...await original<typeof import("../lib/encryption")>(),
  loadKeyFromIDB: mocks.load, saveKeyToIDB: mocks.save, deleteKeyFromIDB: mocks.remove,
}));
vi.mock("../lib/favLockAuth", () => ({ favLockAuth: { getSession: mocks.session, getLocalUser: mocks.user, getCloudStatus: mocks.status } }));
vi.mock("../lib/encryptionMetadataApi", () => ({ fetchEncryptionVerifier: mocks.fetchVerifier, saveEncryptionVerifier: mocks.saveVerifier }));
vi.mock("../lib/encryptionDataProbe", () => ({
  probeEncryptedData: mocks.probe,
  canDecryptExistingData: mocks.canDecrypt,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

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
    mocks.fetchVerifier.mockResolvedValue(null);
    mocks.saveVerifier.mockResolvedValue(undefined);
    mocks.probe.mockResolvedValue("empty");
    mocks.canDecrypt.mockResolvedValue(false);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

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

  it("checkpoints a new key locally before persisting its cloud verifier", async () => {
    mocks.status.mockReturnValue("available");
    mocks.session.mockResolvedValue({
      data: { session: { access_token: "current.jwt.token" } },
      error: null,
    });
    await mount();

    await act(async () => {
      await context.setRawKey("a".repeat(32), { rememberDevice: true });
    });

    expect(mocks.probe).toHaveBeenCalledWith(
      expect.any(CryptoKey),
      "current.jwt.token",
    );
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.saveVerifier).toHaveBeenCalledOnce();
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveVerifier.mock.invocationCallOrder[0],
    );
  });

  it("does not checkpoint or replace a key that mismatches existing data", async () => {
    mocks.status.mockReturnValue("available");
    mocks.session.mockResolvedValue({
      data: { session: { access_token: "current.jwt.token" } },
      error: null,
    });
    mocks.probe.mockResolvedValue("mismatch");
    await mount();

    await expect(
      context.setRawKey("b".repeat(32), { rememberDevice: true }),
    ).rejects.toThrow("does not match your encrypted data");

    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.saveVerifier).not.toHaveBeenCalled();
    expect(
      localStorage.getItem("favlock.local-verifier.v1:local-user"),
    ).toBeNull();
  });

  it("keeps the local checkpoint usable when verifier persistence is ambiguous", async () => {
    mocks.status.mockReturnValue("available");
    mocks.session.mockResolvedValue({
      data: { session: { access_token: "current.jwt.token" } },
      error: null,
    });
    mocks.saveVerifier.mockRejectedValue(new Error("connection lost"));
    await mount();

    await act(async () => {
      await expect(
        context.setRawKey("a".repeat(32), { rememberDevice: true }),
      ).rejects.toThrow("Could not save the encryption key verifier");
    });

    expect(mocks.save).toHaveBeenCalledOnce();
    expect(context.cryptoKey).not.toBeNull();
    expect(context.keyRemembered).toBe(true);
    expect(container.textContent).toBe("unlocked");
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

  it("locks only in-memory key state without touching a newer account's remembered data", async () => {
    const key = await importRawKey("a".repeat(32));
    mocks.load.mockResolvedValue(key);
    await mount();
    await act(async () => context.triggerUnlock());
    const verifier = localStorage.getItem("favlock.local-verifier.v1:local-user");
    localStorage.setItem("favlock.auth.session.v1", "fake-new-account-credentials");
    sessionStorage.setItem("zk_enc_key", "fake-new-session-key-sentinel");
    const writeStorage = vi.spyOn(Storage.prototype, "setItem");
    const removeStorage = vi.spyOn(Storage.prototype, "removeItem");

    await act(async () => context.lockKey());

    expect(context.cryptoKey).toBeNull();
    expect(context.keyRemembered).toBe(false);
    expect(context.needsUnlock).toBe(false);
    expect(container.textContent).toBe("locked");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(writeStorage).not.toHaveBeenCalled();
    expect(removeStorage).not.toHaveBeenCalled();
    expect(localStorage.getItem("favlock.auth.session.v1")).toBe("fake-new-account-credentials");
    expect(localStorage.getItem("favlock.local-verifier.v1:local-user")).toBe(verifier);
    expect(sessionStorage.getItem("zk_enc_key")).toBe("fake-new-session-key-sentinel");
  });

  it("does not adopt a remembered key whose load finishes after a memory-only lock", async () => {
    const pending = deferred<CryptoKey | null>();
    const key = await importRawKey("a".repeat(32));
    mocks.load.mockReturnValue(pending.promise);
    await act(async () => root.render(<EncryptionProvider><Probe /></EncryptionProvider>));
    expect(context.keyLoading).toBe(true);

    await act(async () => context.lockKey());
    await act(async () => pending.resolve(key));

    expect(context.keyLoading).toBe(false);
    expect(context.cryptoKey).toBeNull();
    expect(context.keyRemembered).toBe(false);
    expect(localStorage.getItem("favlock.local-verifier.v1:local-user")).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("does not persist or adopt an unlock that finishes after a memory-only lock", async () => {
    const key = await importRawKey("a".repeat(32));
    saveLocalKeyVerifier("local-user", await createLocalKeyVerifier(key));
    await mount();
    const originalVerifier = localStorage.getItem("favlock.local-verifier.v1:local-user");
    const pending = deferred<{ data: { session: null }; error: null }>();
    mocks.session.mockReturnValue(pending.promise);
    const unlock = context.setRawKey("a".repeat(32), { rememberDevice: true });
    const rejectedUnlock = expect(unlock).rejects.toThrow("The local account changed. Unlock again.");
    await vi.waitFor(() => expect(mocks.session).toHaveBeenCalledTimes(2));

    await act(async () => context.lockKey());
    await act(async () => {
      pending.resolve({ data: { session: null }, error: null });
      await rejectedUnlock;
    });

    expect(context.cryptoKey).toBeNull();
    expect(context.keyRemembered).toBe(false);
    expect(localStorage.getItem("favlock.local-verifier.v1:local-user")).toBe(originalVerifier);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("still deletes the remembered key for explicit clearKey", async () => {
    mocks.load.mockResolvedValue(await importRawKey("a".repeat(32)));
    await mount();
    await act(async () => context.clearKey());

    expect(container.textContent).toBe("locked");
    expect(context.keyRemembered).toBe(false);
    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it.each(["localStorage", "sessionStorage"] as const)("settles key loading when %s access is denied", async (storageName) => {
    const storage = window[storageName];
    const read = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name) {
      if (this === storage) throw new DOMException("Private storage diagnostic", "SecurityError");
      return read.call(this, name);
    });
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    await mount();

    expect(context.keyLoading).toBe(false);
    expect(context.cryptoKey).toBeNull();
    expect(container.textContent).toBe("locked");
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith("Could not load the saved encryption key. Check this browser's storage settings.");
  });
});
