import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PasskeySettingsSection from "./PasskeySettingsSection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  cryptoKey: {} as CryptoKey | null,
  triggerUnlock: vi.fn(),
  exportRawKey: vi.fn(),
  loadPasskeyEncryptionRecord: vi.fn(),
  createPasskeyEncryptionRecord: vi.fn(),
  savePasskeyEncryptionRecord: vi.fn(),
  supportsPasskeyEncryption: vi.fn(),
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    session: { access_token: "current.jwt.token" },
    user: {
      id: "user-123",
      email: "ada@example.com",
      app_metadata: {},
      user_metadata: { full_name: "Ada Lovelace" },
    },
  }),
}));

vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({
    cryptoKey: mocks.cryptoKey,
    keyLoading: false,
    triggerUnlock: mocks.triggerUnlock,
  }),
}));

vi.mock("../lib/encryption", () => ({
  exportRawKey: mocks.exportRawKey,
}));

vi.mock("../lib/passkeyEncryption", () => ({
  loadPasskeyEncryptionRecord: mocks.loadPasskeyEncryptionRecord,
  createPasskeyEncryptionRecord: mocks.createPasskeyEncryptionRecord,
  savePasskeyEncryptionRecord: mocks.savePasskeyEncryptionRecord,
  supportsPasskeyEncryption: mocks.supportsPasskeyEncryption,
}));

vi.mock("./ConfirmDialog", () => ({
  default: ({
    open,
    confirmLabel,
    onConfirm,
  }: {
    open: boolean;
    confirmLabel: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <button type="button" onClick={onConfirm}>
        Confirm {confirmLabel}
      </button>
    ) : null,
}));

const oldRecord = {
  credentialId: "old-credential",
  prfSalt: "A".repeat(43),
  wrappedKey: "B".repeat(80),
};

const newRecord = {
  credentialId: "new-credential",
  prfSalt: "C".repeat(43),
  wrappedKey: "D".repeat(80),
};

describe("PasskeySettingsSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.cryptoKey = {} as CryptoKey;
    mocks.triggerUnlock.mockReset();
    mocks.exportRawKey.mockReset().mockResolvedValue("a".repeat(32));
    mocks.loadPasskeyEncryptionRecord.mockReset().mockResolvedValue(null);
    mocks.createPasskeyEncryptionRecord.mockReset().mockResolvedValue(newRecord);
    mocks.savePasskeyEncryptionRecord.mockReset().mockResolvedValue(undefined);
    mocks.supportsPasskeyEncryption.mockReset().mockResolvedValue(true);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderSection = async () => {
    await act(async () => {
      root.render(<PasskeySettingsSection />);
    });
  };

  const buttonWithText = (text: string) =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(text),
    );

  it("creates a passkey for an existing user who does not have one", async () => {
    await renderSection();

    await act(async () => {
      buttonWithText("Create passkey")!.click();
    });

    expect(mocks.createPasskeyEncryptionRecord).toHaveBeenCalledWith({
      rawKey: "a".repeat(32),
      userId: "user-123",
      userName: "ada@example.com",
      displayName: "Ada Lovelace",
    });
    expect(mocks.savePasskeyEncryptionRecord).toHaveBeenCalledWith(
      "current.jwt.token",
      newRecord,
    );
    expect(container.textContent).toContain(
      "Passkey created. You can now use it to unlock FavLock.",
    );
    expect(buttonWithText("Replace passkey")).toBeTruthy();
  });

  it("confirms before replacing an existing passkey", async () => {
    mocks.loadPasskeyEncryptionRecord.mockResolvedValue(oldRecord);
    await renderSection();

    act(() => {
      buttonWithText("Replace passkey")!.click();
    });
    expect(mocks.createPasskeyEncryptionRecord).not.toHaveBeenCalled();

    await act(async () => {
      buttonWithText("Confirm Replace passkey")!.click();
    });

    expect(mocks.savePasskeyEncryptionRecord).toHaveBeenCalledWith(
      "current.jwt.token",
      newRecord,
    );
    expect(container.textContent).toContain(
      "Passkey replaced. Use the new passkey the next time FavLock asks you to unlock.",
    );
  });

  it("asks the user to unlock before creating a passkey", async () => {
    mocks.cryptoKey = null;
    await renderSection();

    act(() => {
      buttonWithText("Create passkey")!.click();
    });

    expect(mocks.triggerUnlock).toHaveBeenCalledOnce();
    expect(mocks.createPasskeyEncryptionRecord).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Unlock this browser before creating a passkey.",
    );
  });

  it("does not replace an unknown passkey record when the check fails", async () => {
    mocks.loadPasskeyEncryptionRecord.mockRejectedValue(
      new Error("service unavailable"),
    );
    await renderSection();

    expect(buttonWithText("Create passkey")?.disabled).toBe(true);
    expect(container.textContent).toContain(
      "Could not check your saved passkey. Try again.",
    );

    mocks.loadPasskeyEncryptionRecord.mockResolvedValue(null);
    await act(async () => {
      buttonWithText("Check again")!.click();
    });

    expect(buttonWithText("Create passkey")?.disabled).toBe(false);
  });
});
