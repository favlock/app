import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KeyTransferSection from "./KeyTransferSection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  exportRawKey: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({
    cryptoKey: {},
    keyLoading: false,
    triggerUnlock: vi.fn(),
  }),
}));

vi.mock("../lib/encryption", () => ({
  exportRawKey: mocks.exportRawKey,
  normalizeRawKey: (key: string) => key.replace(/[^A-Za-z0-9]/g, ""),
}));

describe("KeyTransferSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.exportRawKey.mockReset().mockResolvedValue(
      "12345678901234567890123456789012",
    );
    mocks.writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows and copies the encryption key only after the user requests it", async () => {
    await act(async () => {
      root.render(<KeyTransferSection />);
    });

    expect(document.body.textContent).toContain("Encryption key");
    expect(document.body.textContent).toContain("Show QR");
    expect(document.body.textContent).toContain("Show key");
    expect(document.body.textContent).not.toContain("1234 5678 9012 3456");

    const showKeyButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Show key"),
    );

    await act(async () => {
      showKeyButton!.click();
    });

    const formattedKey = "1234 5678 9012 3456 7890 1234 5678 9012";
    expect(document.body.textContent).toContain(formattedKey);

    const copyKeyButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Copy key"),
    );

    await act(async () => {
      copyKeyButton!.click();
    });

    expect(mocks.writeText).toHaveBeenCalledWith(formattedKey);
    expect(document.body.textContent).toContain("Encryption key copied to clipboard.");
  });
});
