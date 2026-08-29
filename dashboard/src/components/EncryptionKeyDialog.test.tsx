import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EncryptionKeyDialog from "./EncryptionKeyDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const TEST_KEY = "1234 5678 9012 3456 7890 1234 5678 9012";

const { supportsPasskeyEncryption, writeText } = vi.hoisted(() => ({
  supportsPasskeyEncryption: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("../lib/passkeyEncryption", () => ({
  supportsPasskeyEncryption,
}));

describe("EncryptionKeyDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    supportsPasskeyEncryption.mockReset().mockResolvedValue(true);
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("explains the encryption key and offers recovery after creating a passkey", async () => {
    const onSaveWithPasskey = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <EncryptionKeyDialog
          encryptionKey={TEST_KEY}
          preparedMethod={null}
          onSaveWithPasskey={onSaveWithPasskey}
          onComplete={onComplete}
        />,
      );
    });

    expect(document.body.textContent).toContain(
      "Your library has its own key",
    );
    expect(document.body.textContent).toContain(
      "FavLock cannot recover your encrypted library",
    );
    expect(document.body.textContent).toContain(
      "Recommended: protect it with a passkey",
    );
    expect(document.body.textContent).toContain(
      "does not sign you in to FavLock",
    );

    const saveButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Protect with a passkey"),
    );

    await act(async () => {
      saveButton!.click();
    });

    expect(onSaveWithPasskey).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Encryption key protected");
    expect(document.body.textContent).not.toContain("Your library has its own key");
    expect(document.body.textContent).toContain("Download recovery key");
    expect(document.body.textContent).toContain("1234 5678 9012 3456");
    expect(document.body.textContent).not.toContain("Scan this on your phone");
    expect(document.querySelector('img[alt="Encryption key QR code"]')).toBeNull();

    const continueButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent === "Continue");

    await act(async () => {
      continueButton!.click();
    });

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith("passkey");
  });

  it("requires explicit recovery confirmation before completion", async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      root.render(
        <EncryptionKeyDialog
          encryptionKey={TEST_KEY}
          preparedMethod={null}
          onSaveWithPasskey={vi.fn()}
          onComplete={onComplete}
        />,
      );
    });

    const fallbackButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Save recovery key instead"),
    )!;
    await act(async () => fallbackButton.click());

    expect(document.body.textContent).not.toContain("Your library has its own key");
    const copyButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Copy key"),
    )!;
    expect(copyButton.closest(".border-amber-200")?.textContent).toContain(
      "1234 5678 9012 3456",
    );
    const keyRows = Array.from(
      document.querySelectorAll('[aria-label="Recovery key"] p'),
    ).map((row) => row.textContent);
    expect(keyRows).toEqual([
      "1234 5678 9012 3456",
      "7890 1234 5678 9012",
    ]);
    await act(async () => copyButton.click());
    expect(writeText).toHaveBeenCalledWith(TEST_KEY);
    expect(document.body.textContent).toContain(
      "Recovery key copied to clipboard.",
    );

    const continueButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("I saved it, continue"),
    ) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);
    expect(document.body.textContent).not.toContain("Remember this device");

    await act(async () => {
      (document.querySelector('[role="checkbox"]') as HTMLElement).click();
    });
    expect(continueButton.disabled).toBe(false);

    await act(async () => continueButton.click());
    expect(onComplete).toHaveBeenCalledWith("recovery-key");
  });

  it("keeps manual recovery available when clipboard access fails", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    await act(async () => {
      root.render(
        <EncryptionKeyDialog
          encryptionKey={TEST_KEY}
          preparedMethod={null}
          onSaveWithPasskey={vi.fn()}
          onComplete={vi.fn()}
        />,
      );
    });

    const fallbackButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Save recovery key instead"),
    )!;
    await act(async () => fallbackButton.click());
    const copyButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Copy key"),
    )!;
    await act(async () => copyButton.click());

    expect(document.body.textContent).toContain(
      "Could not copy the recovery key. Select the key and copy it manually instead.",
    );
    expect(document.body.textContent).toContain("1234 5678 9012 3456");
    expect(document.body.textContent).toContain("7890 1234 5678 9012");
  });

  it("uses recovery as the primary supported fallback when passkeys are unavailable", async () => {
    supportsPasskeyEncryption.mockResolvedValue(false);
    await act(async () => {
      root.render(
        <EncryptionKeyDialog
          encryptionKey={TEST_KEY}
          preparedMethod={null}
          onSaveWithPasskey={vi.fn()}
          onComplete={vi.fn()}
        />,
      );
    });

    expect(document.body.textContent).toContain(
      "This browser or passkey provider cannot protect encryption keys",
    );
    expect(document.body.textContent).toContain("Download recovery key");
    expect(document.body.textContent).not.toContain("Protect with a passkey");
  });

  it("keeps recovery available after passkey cancellation", async () => {
    const onSaveWithPasskey = vi
      .fn()
      .mockRejectedValue(new Error("Passkey creation was cancelled or timed out."));
    await act(async () => {
      root.render(
        <EncryptionKeyDialog
          encryptionKey={TEST_KEY}
          preparedMethod={null}
          onSaveWithPasskey={onSaveWithPasskey}
          onComplete={vi.fn()}
        />,
      );
    });

    const passkeyButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Protect with a passkey"),
    )!;
    await act(async () => passkeyButton.click());

    expect(document.body.textContent).toContain(
      "Passkey creation was cancelled or timed out.",
    );
    expect(document.body.textContent).toContain("Save recovery key instead");
  });

  it("resumes after passkey persistence without claiming final completion", async () => {
    const onComplete = vi.fn();
    await act(async () => {
      root.render(
        <EncryptionKeyDialog
          encryptionKey={TEST_KEY}
          preparedMethod="passkey"
          onSaveWithPasskey={vi.fn()}
          onComplete={onComplete}
        />,
      );
    });

    expect(document.body.textContent).toContain("Encryption key protected");
    expect(onComplete).not.toHaveBeenCalled();
    expect(
      Array.from(document.querySelectorAll("button")).some(
        (button) => button.textContent === "Continue",
      ),
    ).toBe(true);
  });
});
