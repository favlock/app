import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EncryptionKeyDialog from "./EncryptionKeyDialog";

const TEST_KEY = "1234 5678 9012 3456 7890 1234 5678 9012";

vi.mock("../lib/passkeyEncryption", () => ({
  supportsPasskeyEncryption: () => Promise.resolve(true),
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: () => Promise.resolve("data:image/png;base64,test"),
  },
}));

describe("EncryptionKeyDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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
          rememberDevice={false}
          onRememberDeviceChange={() => {}}
          onSaveWithPasskey={onSaveWithPasskey}
          onComplete={onComplete}
        />,
      );
    });

    expect(document.body.textContent).toContain(
      "Why you have an encryption key",
    );
    expect(document.body.textContent).toContain(
      "Only this key can unlock that data",
    );
    expect(document.body.textContent).toContain(
      "Why protect it with a passkey",
    );
    expect(document.body.textContent).toContain(
      "does not replace how you sign in",
    );

    const saveButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Protect with a passkey"),
    );

    await act(async () => {
      saveButton!.click();
    });

    expect(onSaveWithPasskey).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Encryption key protected");
    expect(document.body.textContent).toContain("Download recovery key");
    expect(document.body.textContent).toContain("1234 5678 9012 3456");

    const continueButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent === "Continue");

    await act(async () => {
      continueButton!.click();
    });

    expect(onComplete).toHaveBeenCalledOnce();
  });
});
