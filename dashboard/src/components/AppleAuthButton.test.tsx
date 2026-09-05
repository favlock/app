import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD_HOME_URL } from "../lib/appUrls";
import AppleAuthButton from "./AppleAuthButton";

const { signInWithOAuth } = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
}));

vi.mock("../lib/favLockAuth", () => ({
  favLockAuth: { signInWithOAuth },
}));

describe("AppleAuthButton", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    signInWithOAuth.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("starts Apple OAuth and prevents repeat clicks while redirecting", async () => {
    signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    const onError = vi.fn();

    await act(async () => {
      root.render(<AppleAuthButton onError={onError} />);
    });

    const button = container.querySelector("button")!;
    await act(async () => button.click());

    expect(onError).toHaveBeenCalledWith(null);
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "apple",
      options: { redirectTo: DASHBOARD_HOME_URL },
    });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("Continue with Apple");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(button.querySelector("img")?.className).toContain("translate-y-0.5");
    expect(button.textContent).toContain("Redirecting to Apple...");
  });

  it("shows provider errors and re-enables the button", async () => {
    signInWithOAuth.mockResolvedValue({
      data: {},
      error: new Error("Apple provider is disabled"),
    });
    const onError = vi.fn();

    await act(async () => {
      root.render(<AppleAuthButton onError={onError} />);
    });

    const button = container.querySelector("button")!;
    await act(async () => button.click());

    expect(onError).toHaveBeenLastCalledWith("Apple provider is disabled");
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain("Continue with Apple");
  });

  it("does not start OAuth when externally disabled", async () => {
    const onError = vi.fn();

    await act(async () => {
      root.render(<AppleAuthButton onError={onError} disabled />);
    });

    const button = container.querySelector("button")!;
    expect(button.disabled).toBe(true);
    await act(async () => button.click());

    expect(signInWithOAuth).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
