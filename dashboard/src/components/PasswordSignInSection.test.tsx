import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PasswordSignInSection from "./PasswordSignInSection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const { signInWithPassword, updateUser } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("../lib/favLockAuth", () => ({
  favLockAuth: { signInWithPassword, updateUser },
}));

vi.mock("./CloudflareTurnstile", () => ({
  default: ({
    onVerify,
  }: {
    onVerify: (token: string | null) => void;
  }) => (
    <button type="button" onClick={() => onVerify("turnstile-token")}>
      Complete security check
    </button>
  ),
}));

describe("PasswordSignInSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    signInWithPassword.mockReset();
    updateUser.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderSection = async (hasPassword = false) => {
    await act(async () => {
      root.render(
        <PasswordSignInSection
          email="ada@example.com"
          hasPassword={hasPassword}
        />,
      );
    });
  };

  const fillInputs = (...values: string[]) => {
    const inputs = container.querySelectorAll("input");
    const setInputValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;

    act(() => {
      values.forEach((value, index) => {
        const input = inputs[index] as HTMLInputElement;
        setInputValue.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
  };

  it("adds a password to the signed-in account", async () => {
    updateUser.mockResolvedValue({ data: {}, error: null });
    await renderSection();
    fillInputs("secret123", "secret123");

    await act(async () => {
      container.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(updateUser).toHaveBeenCalledWith({
      password: "secret123",
      data: { password_sign_in_enabled: true },
    });
    expect(container.textContent).toContain(
      "You can now sign in as ada@example.com with Google or your password.",
    );
    expect(
      Array.from(container.querySelectorAll("input")).every(
        (input) => input.value === "",
      ),
    ).toBe(true);
  });

  it("rejects passwords that do not match", async () => {
    await renderSection();
    fillInputs("secret123", "different123");

    await act(async () => {
      container.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(updateUser).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Passwords do not match.");
  });

  it("requires at least eight characters for a new password", async () => {
    await renderSection();
    fillInputs("short7", "short7");

    await act(async () => {
      container.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(updateUser).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Password must be at least 8 characters.",
    );
  });

  it("confirms the old password before changing an existing password", async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: null });
    updateUser.mockResolvedValue({ data: {}, error: null });
    await renderSection(true);
    fillInputs("old-secret", "new-secret", "new-secret");

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Complete security"))!
        .click();
    });

    await act(async () => {
      container.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "old-secret",
      options: { captchaToken: "turnstile-token" },
    });
    expect(updateUser).toHaveBeenCalledWith({
      password: "new-secret",
      current_password: "old-secret",
      data: { password_sign_in_enabled: true },
    });
    expect(container.textContent).toContain("Change password");
  });

  it("does not change the password when old-password confirmation fails", async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: new Error("Invalid login credentials"),
    });
    await renderSection(true);
    fillInputs("wrong-secret", "new-secret", "new-secret");

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Complete security"))!
        .click();
    });

    await act(async () => {
      container.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(updateUser).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Current password is incorrect.");
  });
});
