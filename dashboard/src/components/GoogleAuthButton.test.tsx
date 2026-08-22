import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GoogleAuthButton from "./GoogleAuthButton";
import { DASHBOARD_HOME_URL } from "../lib/appUrls";

const { signInWithOAuth } = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
}));

vi.mock("../lib/favLockAuth", () => ({
  favLockAuth: { signInWithOAuth },
}));

describe("GoogleAuthButton", () => {
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

  it("starts Google OAuth and prevents repeat clicks while redirecting", async () => {
    signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    const onError = vi.fn();

    await act(async () => {
      root.render(
        <GoogleAuthButton onError={onError}>
          Sign in with Google
        </GoogleAuthButton>,
      );
    });

    const button = container.querySelector("button")!;
    expect(button.disabled).toBe(false);
    expect(button.textContent).not.toContain("Soon");

    await act(async () => button.click());

    expect(onError).toHaveBeenCalledWith(null);
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: DASHBOARD_HOME_URL,
      },
    });
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Redirecting...");
  });

  it("shows provider errors and re-enables the button", async () => {
    signInWithOAuth.mockResolvedValue({
      data: {},
      error: new Error("Google provider is disabled"),
    });
    const onError = vi.fn();

    await act(async () => {
      root.render(
        <GoogleAuthButton onError={onError}>
          Continue with Google
        </GoogleAuthButton>,
      );
    });

    const button = container.querySelector("button")!;
    await act(async () => button.click());

    expect(onError).toHaveBeenLastCalledWith("Google provider is disabled");
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain("Continue with Google");
  });

  it("does not start OAuth when externally disabled", async () => {
    const onError = vi.fn();

    await act(async () => {
      root.render(
        <GoogleAuthButton onError={onError} disabled>
          Continue with Google
        </GoogleAuthButton>,
      );
    });

    const button = container.querySelector("button")!;
    expect(button.disabled).toBe(true);

    await act(async () => button.click());

    expect(signInWithOAuth).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
