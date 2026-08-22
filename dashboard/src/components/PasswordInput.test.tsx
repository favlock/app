import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PasswordInput from "./PasswordInput";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("PasswordInput", () => {
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

  it("shows and hides the password without changing its value", async () => {
    await act(async () => {
      root.render(
        <PasswordInput
          defaultValue="Secret123!"
          visibilityLabel="new password"
        />,
      );
    });

    const input = container.querySelector("input")!;
    const showButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show new password"]',
    )!;

    expect(input.type).toBe("password");
    expect(input.value).toBe("Secret123!");
    expect(showButton.getAttribute("aria-pressed")).toBe("false");

    await act(async () => showButton.click());

    const hideButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Hide new password"]',
    )!;
    expect(input.type).toBe("text");
    expect(input.value).toBe("Secret123!");
    expect(hideButton.getAttribute("aria-pressed")).toBe("true");

    await act(async () => hideButton.click());

    expect(input.type).toBe("password");
  });
});
