import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthPage from "./Register";

const { resend, signInWithOAuth, signInWithPassword, signUp } = vi.hoisted(
  () => ({
    resend: vi.fn(),
    signInWithOAuth: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
  }),
);

vi.mock("../lib/favLockAuth", () => ({
  favLockAuth: { resend, signInWithOAuth, signInWithPassword, signUp },
}));

vi.mock("../components/CloudflareTurnstile", () => ({
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

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Could not find button: ${label}`);
  return button;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("AuthPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resend.mockReset();
    signInWithOAuth.mockReset();
    signInWithPassword.mockReset();
    signUp.mockReset();
    window.history.replaceState({}, "", "/login");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderAuthPage = async (initialEntry = "/login") => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <AuthPage />
        </MemoryRouter>,
      );
    });
  };

  const openEmailSignIn = async () => {
    await act(async () => {
      findButton(container, "Continue with email").click();
    });
  };

  const openEmailSignUp = async () => {
    await openEmailSignIn();
    await act(async () => {
      findButton(container, "Create account").click();
    });
  };

  const completeSecurityCheck = async () => {
    await act(async () => {
      findButton(container, "Complete security check").click();
    });
  };

  const submitForm = async () => {
    await act(async () => {
      const form = container.querySelector("form");
      const submitButton = Array.from(
        container.querySelectorAll<HTMLButtonElement>("form button"),
      ).find((button) => button.textContent?.includes("with email"));
      if (!form) throw new Error("Could not find the email form.");
      if (!submitButton) throw new Error("Could not find the email submit button.");
      expect(form.noValidate).toBe(true);
      expect(submitButton.type).toBe("submit");
      submitButton.click();
    });
  };

  const fillSignUpForm = async (email = "ada@example.com") => {
    const inputs = container.querySelectorAll<HTMLInputElement>("input");
    await act(async () => {
      setInputValue(inputs[0], "Ada");
      setInputValue(inputs[1], "Lovelace");
      setInputValue(inputs[2], email);
      setInputValue(inputs[3], "secret123");
      setInputValue(inputs[4], "secret123");
    });
  };

  it("shows Google and email authentication in the unified production flow", async () => {
    await renderAuthPage();

    expect(container.textContent).toContain("Welcome to FavLock");
    expect(container.textContent).toContain("Continue with Google");
    expect(container.textContent).toContain("Continue with email");
    expect(container.textContent).toContain("By continuing");
    expect(container.querySelector('input[type="email"]')).toBeNull();
  });

  it("makes sign in and account creation equally visible as accessible tabs", async () => {
    await renderAuthPage();
    await openEmailSignIn();

    const signInTab = container.querySelector<HTMLButtonElement>(
      "#email-sign-in-tab",
    )!;
    const signUpTab = container.querySelector<HTMLButtonElement>(
      "#email-sign-up-tab",
    )!;

    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(signInTab.getAttribute("aria-selected")).toBe("true");
    expect(signUpTab.getAttribute("aria-selected")).toBe("false");

    await act(async () => {
      signInTab.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });

    expect(signUpTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(signUpTab);
    expect(container.textContent).toContain("Create account with email");
    expect(
      container.querySelector('input[autocomplete="given-name"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[role="meter"]')?.getAttribute("aria-valuenow"),
    ).toBe("0");
  });

  it("signs an existing user in with email and Turnstile", async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: null });
    await renderAuthPage();
    await openEmailSignIn();

    const inputs = container.querySelectorAll<HTMLInputElement>("input");
    await act(async () => {
      setInputValue(inputs[0], " ada@example.com ");
      setInputValue(inputs[1], "old1");
    });
    await completeSecurityCheck();
    await submitForm();

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "old1",
      options: { captchaToken: "turnstile-token" },
    });
  });

  it("runs the submit handler when native email validation would block it", async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: null });
    await renderAuthPage();
    await openEmailSignIn();

    const inputs = container.querySelectorAll<HTMLInputElement>("input");
    await act(async () => {
      setInputValue(inputs[0], " ada@example.com ");
      setInputValue(inputs[1], "correct horse battery staple");
    });
    inputs[0].setCustomValidity("Native validation would block submission.");
    expect(inputs[0].validity.valid).toBe(false);

    await completeSecurityCheck();
    await submitForm();

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "correct horse battery staple",
      options: { captchaToken: "turnstile-token" },
    });
  });

  it("shows a client error instead of sending invalid email credentials", async () => {
    await renderAuthPage();
    await openEmailSignIn();

    const inputs = container.querySelectorAll<HTMLInputElement>("input");
    await act(async () => {
      setInputValue(inputs[0], "not-an-email");
      setInputValue(inputs[1], "correct horse battery staple");
    });
    await completeSecurityCheck();
    await submitForm();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Enter a valid email address.",
    );
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("creates an email account and supports confirmation-email resend", async () => {
    signUp.mockResolvedValue({
      data: { user: { id: "user-1" }, session: null },
      error: null,
    });
    resend.mockResolvedValue({ data: {}, error: null });

    await renderAuthPage("/login?next=%2Fcheckout");
    await openEmailSignUp();
    await fillSignUpForm();
    await completeSecurityCheck();
    await submitForm();

    expect(signUp).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "secret123",
      options: {
        captchaToken: "turnstile-token",
        emailRedirectTo: expect.stringMatching(/\/checkout$/),
        data: { first_name: "Ada", last_name: "Lovelace" },
      },
    });
    expect(container.textContent).toContain("Check your inbox");
    expect(container.textContent).toContain("ada@example.com");

    await completeSecurityCheck();
    await act(async () => {
      findButton(container, "Resend confirmation email").click();
    });

    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "ada@example.com",
      options: {
        captchaToken: "turnstile-token",
        emailRedirectTo: expect.stringMatching(/\/checkout$/),
      },
    });
    expect(container.textContent).toContain(
      "A new confirmation email is on its way.",
    );
  });

  it("shows Terms and support links when signup rejects a disposable email", async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: {
        message:
          "Disposable email addresses are not allowed for new FavLock accounts. If this is a mistake, contact support@favlock.app.",
      },
    });

    await renderAuthPage();
    await openEmailSignUp();
    await fillSignUpForm("test@mailinator.com");
    await completeSecurityCheck();
    await submitForm();

    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain(
      "Disposable email addresses are not allowed",
    );
    expect(
      alert.querySelector<HTMLAnchorElement>(
        'a[href$="/terms#disposable-email-addresses"]',
      ),
    ).not.toBeNull();
    expect(
      alert.querySelector<HTMLAnchorElement>(
        'a[href="mailto:support@favlock.app"]',
      ),
    ).not.toBeNull();
    expect(alert.querySelectorAll("p")).toHaveLength(1);
  });

  it("preserves Pro checkout through Google authentication", async () => {
    signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    await renderAuthPage("/login?next=%2Fcheckout");

    await act(async () => {
      findButton(container, "Continue with Google").click();
    });

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: expect.stringMatching(/\/checkout$/),
      },
    });
  });

  it("renders Terms and support links for an OAuth disposable-email error", async () => {
    window.history.replaceState(
      {},
      "",
      "/login#error_description=Disposable%20email%20addresses%20are%20not%20allowed%20for%20new%20FavLock%20accounts.%20If%20this%20is%20a%20mistake%2C%20contact%20support%40favlock.app.",
    );

    await renderAuthPage();

    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain(
      "Disposable email addresses are not allowed",
    );
    expect(
      alert.querySelector<HTMLAnchorElement>(
        'a[href$="/terms#disposable-email-addresses"]',
      ),
    ).not.toBeNull();
    expect(
      alert.querySelector<HTMLAnchorElement>(
        'a[href="mailto:support@favlock.app"]',
      ),
    ).not.toBeNull();
    expect(alert.querySelectorAll("p")).toHaveLength(1);
  });
});
