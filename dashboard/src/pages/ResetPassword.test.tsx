import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD_RESET_PASSWORD_URL } from "../lib/appUrls";
import { captureInitialPasswordRecoveryRedirect } from "../lib/authRecovery";
import ResetPassword from "./ResetPassword";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const {
  exchangeCodeForSession,
  getSession,
  resetPasswordForEmail,
  updateUser,
} = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getSession: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("../lib/favLockAuth", () => ({
  favLockAuth: {
    exchangeCodeForSession,
    getSession,
    resetPasswordForEmail,
    updateUser,
  },
}));

describe("ResetPassword", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    getSession.mockReset();
    resetPasswordForEmail.mockReset();
    updateUser.mockReset();
    window.history.replaceState({}, "", "/reset-password");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("requests a reset email without widget completion", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ResetPassword />
        </MemoryRouter>,
      );
    });

    const emailInput = container.querySelector("input")!;
    const setInputValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;

    await act(async () => {
      setInputValue.call(emailInput, "ada@example.com");
      emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      container.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(resetPasswordForEmail).toHaveBeenCalledWith("ada@example.com", {
      redirectTo: DASHBOARD_RESET_PASSWORD_URL,
    });
  });

  it("shows the new-password form after the auth client consumes a PKCE code", async () => {
    window.history.replaceState(
      {},
      "",
      "/reset-password?code=recovery-code",
    );
    captureInitialPasswordRecoveryRedirect();

    // The Auth client exchanges the code before this lazy page mounts.
    window.history.replaceState({}, "", "/reset-password");
    getSession.mockResolvedValue({
      data: { session: { access_token: "recovery-access-token" } },
      error: null,
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ResetPassword />
        </MemoryRouter>,
      );
    });

    expect(getSession).toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Set a new password for your account.",
    );
    expect(container.querySelectorAll('input[type="password"]')).toHaveLength(
      2,
    );
    expect(
      Array.from(
        container.querySelectorAll<HTMLInputElement>('input[type="password"]'),
      ).every((input) => input.minLength === 8),
    ).toBe(true);
    expect(container.querySelector('[role="meter"]')).not.toBeNull();
  });
});
