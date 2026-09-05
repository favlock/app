import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UnlockDialog from "./UnlockDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const {
  loadPasskeyEncryptionRecord,
  readLocalPasskeyRecord,
  localAccount,
  signOut,
  setRawKey,
  unwrapEncryptionKeyWithPasskey,
} = vi.hoisted(() => ({
  loadPasskeyEncryptionRecord: vi.fn(),
  readLocalPasskeyRecord: vi.fn(),
  localAccount: { current: false },
  signOut: vi.fn(),
  setRawKey: vi.fn(),
  unwrapEncryptionKeyWithPasskey: vi.fn(),
}));

vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({ needsUnlock: true, setRawKey }),
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    session: { access_token: "current.jwt.token" },
    user: { id: "test-user", email: "test@example.com" },
    signOut,
    isLocalAccount: localAccount.current,
  }),
}));

vi.mock("../lib/localVault", () => ({
  readLocalPasskeyRecord,
}));

vi.mock("../lib/passkeyEncryption", () => ({
  loadPasskeyEncryptionRecord,
  unwrapEncryptionKeyWithPasskey,
}));

vi.mock("./KeyQrScanner", () => ({
  default: () => null,
}));

describe("UnlockDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    localAccount.current = false;
    setRawKey.mockReset().mockResolvedValue(undefined);
    signOut.mockReset().mockResolvedValue(undefined);
    loadPasskeyEncryptionRecord.mockReset().mockResolvedValue(null);
    readLocalPasskeyRecord.mockReset().mockResolvedValue(null);
    unwrapEncryptionKeyWithPasskey.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<UnlockDialog />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const enterKey = () => {
    const input = document.querySelector(
      '#unlock-form input:not([type="file"])',
    ) as HTMLInputElement;
    const setInputValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;

    act(() => {
      setInputValue.call(input, "1234 5678 9012 3456 7890 1234 5678 9012");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  const submit = async () => {
    await act(async () => {
      document.getElementById("unlock-form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
  };

  it("remembers the key by default", async () => {
    enterKey();
    await submit();

    expect(setRawKey).toHaveBeenCalledWith(
      "1234 5678 9012 3456 7890 1234 5678 9012",
      { rememberDevice: true },
    );
  });

  it("marks action icons for vertical alignment", () => {
    const actionIcons = document.querySelectorAll(
      'button svg[data-slot="icon"][aria-hidden="true"]',
    );

    expect(actionIcons).toHaveLength(3);
  });

  it("keeps the key memory-only after explicit opt-out", async () => {
    enterKey();

    await act(async () => {
      (document.querySelector('[role="checkbox"]') as HTMLElement).click();
    });
    await submit();

    expect(setRawKey).toHaveBeenCalledWith(
      "1234 5678 9012 3456 7890 1234 5678 9012",
      { rememberDevice: false },
    );
  });

  it("reuses the encryption key protected by a passkey", async () => {
    const passkeyRecord = {
      credentialId: "credential",
      prfSalt: "salt",
      wrappedKey: "wrapped",
    };
    loadPasskeyEncryptionRecord.mockResolvedValue(passkeyRecord);
    unwrapEncryptionKeyWithPasskey.mockResolvedValue(
      "1234 5678 9012 3456 7890 1234 5678 9012",
    );

    await act(async () => {
      root.unmount();
      root = createRoot(container);
      root.render(<UnlockDialog />);
    });

    const passkeyButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Unlock with passkey"));
    expect(passkeyButton).toBeTruthy();
    expect(loadPasskeyEncryptionRecord).toHaveBeenCalledWith(
      "current.jwt.token",
    );

    await act(async () => {
      passkeyButton!.click();
    });

    expect(unwrapEncryptionKeyWithPasskey).toHaveBeenCalledWith(
      passkeyRecord,
      "test-user",
    );
    expect(setRawKey).toHaveBeenCalledWith(
      "1234 5678 9012 3456 7890 1234 5678 9012",
      { rememberDevice: true },
    );
  });

  it("signs out and clears local data from the unlock dialog", async () => {
    const signOutButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) =>
      button.textContent?.includes("Sign out & clear local data"),
    );

    await act(async () => {
      signOutButton!.click();
    });

    expect(signOut).toHaveBeenCalledOnce();
    expect(
      document
        .querySelector('[id^="headlessui-dialog-panel-"]')
        ?.hasAttribute("data-closed"),
    ).toBe(true);
  });

  it("requires destructive confirmation before erasing a local vault", async () => {
    localAccount.current = true;
    await act(async () => {
      root.unmount();
      root = createRoot(container);
      root.render(<UnlockDialog />);
    });

    const signOutButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Sign out & erase vault"));

    await act(async () => signOutButton!.click());

    expect(signOut).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Erase this local vault?");
    expect(document.body.textContent).toContain(
      "permanently erase everything stored in this local vault",
    );

    const confirmButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Erase vault & sign out"));
    await act(async () => confirmButton!.click());

    expect(signOut).toHaveBeenCalledOnce();
  });
});
