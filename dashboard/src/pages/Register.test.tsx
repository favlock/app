import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthPage from "./Register";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function NavigationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output data-location>{location.pathname}{location.search}</output>
    <button onClick={() => navigate(-1)}>Browser back</button>
    <button onClick={() => navigate(1)}>Browser forward</button>
  </>;
}

const { createLocalAccount, resend, signInWithOAuth, signInWithPassword, signUp } = vi.hoisted(
  () => ({
    createLocalAccount: vi.fn(),
    resend: vi.fn(),
    signInWithOAuth: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
  }),
);

vi.mock("../lib/favLockAuth", () => ({
  favLockAuth: {
    createLocalAccount,
    resend,
    signInWithOAuth,
    signInWithPassword,
    signUp,
  },
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
    createLocalAccount.mockReset().mockResolvedValue({ error: null });
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
    vi.useRealTimers();
  });

  const renderAuthPage = async (initialEntry = "/login") => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <AuthPage />
          <NavigationProbe />
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

  const fillSignUpForm = async (email = "ada@example.com", password = "secret123") => {
    const inputs = container.querySelectorAll<HTMLInputElement>("input");
    await act(async () => {
      setInputValue(inputs[0], email);
      setInputValue(inputs[1], password);
    });
  };

  it("asks for just email and one pasteable password with labels and a visibility toggle", async () => {
    await renderAuthPage("/login?mode=sign-up");
    await openEmailSignIn();
    const inputs = container.querySelectorAll<HTMLInputElement>("input");
    expect(inputs).toHaveLength(2);
    expect(inputs[0].name).toBe("email");
    expect(inputs[0].autocomplete).toBe("email");
    const password = inputs[1];
    expect(password.name).toBe("password");
    expect(password.autocomplete).toBe("new-password");
    expect(password.minLength).toBe(8);
    for (const input of inputs) expect(input.labels?.length).toBeGreaterThan(0);
    expect(password.getAttribute("aria-describedby")).toContain("signup-password-requirements");
    expect(container.textContent).toContain("At least 8 characters");
    expect(container.textContent).toContain("By continuing");
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    expect(password.dispatchEvent(paste)).toBe(true);
    await act(async () => setInputValue(password, "pasted generated password"));
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="Show password"]')!;
    expect(toggle.type).toBe("button");
    toggle.focus();
    await act(async () => toggle.click());
    expect(password.type).toBe("text");
    expect(password.value).toBe("pasted generated password");
    expect(toggle.getAttribute("aria-label")).toBe("Hide password");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(toggle);
    await act(async () => toggle.click());
    expect(password.type).toBe("password");
    expect(signUp).not.toHaveBeenCalled();
  });

  it.each([
    ["", "secret123", "email", "Enter your email address."],
    ["not-an-email", "secret123", "email", "Enter a valid email address."],
    ["ada@example.com", "", "password", "Enter your password."],
    ["ada@example.com", "short", "password", "Password must be at least 8 characters."],
    ["ada@example.com", "x".repeat(1025), "password", "Password must be no more than 1024 characters."],
  ])("rejects invalid signup input with a focused, described field (%#)", async (email, password, field, message) => {
    await renderAuthPage("/login?mode=sign-up");
    await openEmailSignIn();
    await fillSignUpForm(email, password);
    await completeSecurityCheck();
    await submitForm();
    const input = container.querySelector<HTMLInputElement>(`input[name="${field}"]`)!;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain("email-auth-error");
    expect(document.activeElement).toBe(input);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("blocks signup without security verification, including direct form submissions", async () => {
    await renderAuthPage("/login?mode=sign-up");
    await openEmailSignIn();
    await fillSignUpForm();
    expect(findButton(container, "Create account with email").disabled).toBe(true);
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Complete the security verification");
    expect(signUp).not.toHaveBeenCalled();
  });

  it.each([
    "Security verification failed. Please try again.",
    "Too many requests. Try again later.",
    "The account request could not be completed.",
    "Choose a stronger password and try again.",
  ])("shows the safe signup error and requires fresh CAPTCHA: %s", async (message) => {
    signUp.mockResolvedValue({ data: { session: null }, error: { message } });
    await renderAuthPage("/login?mode=sign-up");
    await openEmailSignIn();
    await fillSignUpForm();
    await completeSecurityCheck();
    await submitForm();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(findButton(container, "Create account with email").disabled).toBe(true);
    expect(container.textContent).not.toContain("Check your inbox");
    await completeSecurityCheck();
    expect(findButton(container, "Create account with email").disabled).toBe(false);
  });

  it("does not submit again while signup is pending", async () => {
    let finish!: (value: unknown) => void;
    signUp.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await renderAuthPage("/login?mode=sign-up");
    await openEmailSignIn();
    await fillSignUpForm();
    await completeSecurityCheck();
    await submitForm();
    expect(findButton(container, "Creating account...").disabled).toBe(true);
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(signUp).toHaveBeenCalledOnce();
    await act(async () => finish({ data: { session: null }, error: null }));
    expect(container.textContent).toContain("Check your inbox");
  });

  it("shows email first, then the provider options in the unified production flow", async () => {
    await renderAuthPage();

    expect(container.textContent).toContain("Welcome to FavLock");
    expect(container.textContent).toContain("Continue with Google");
    expect(container.textContent).toContain("Continue with Apple");
    expect(container.textContent).toContain("Continue with email");
    expect(container.textContent).not.toContain("Try FavLock locally");
    expect(container.textContent).toContain("By continuing");
    expect(container.querySelector('input[type="email"]')).toBeNull();
    const optionLabels = Array.from(container.querySelectorAll("button")).map(
      (button) => button.getAttribute("aria-label") ?? button.textContent?.trim(),
    );
    expect(optionLabels.indexOf("Continue with email")).toBeLessThan(
      optionLabels.indexOf("Continue with Google"),
    );
    expect(optionLabels.indexOf("Continue with Google")).toBeLessThan(
      optionLabels.indexOf("Continue with Apple"),
    );
    const googleButton = findButton(container, "Continue with Google");
    const appleButton = findButton(container, "Continue with Apple");
    expect(googleButton.className).toBe(appleButton.className);
    expect(googleButton.getAttribute("style")).toBeNull();
    expect(appleButton.getAttribute("style")).toBeNull();
  });

  it.each([
    ["/login?local=1", true],
    ["/login?local=0", false],
    ["/login?local=1&local=1", false],
  ])("shows the local trial only for the explicit local flag (%s)", async (path, visible) => {
    await renderAuthPage(path);

    expect(container.textContent?.includes("Try FavLock locally")).toBe(visible);
    if (!visible) return;

    await act(async () => findButton(container, "Try FavLock locally").click());
    expect(createLocalAccount).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-location]")?.textContent).toBe("/");
  });

  it("starts the local app automatically from the explicit local auto flag", async () => {
    await renderAuthPage("/login?local=auto&next=%2Ftasks");

    await vi.waitFor(() => expect(createLocalAccount).toHaveBeenCalledOnce());
    await vi.waitFor(() => {
      expect(container.querySelector("[data-location]")?.textContent).toBe(
        "/tasks",
      );
    });
    expect(container.textContent).not.toContain("Try FavLock locally");
  });

  it.each([
    "/login?local=auto&local=auto",
    "/login?local=auto&reconnect=1",
    "/login?local=automatic",
  ])("does not auto-start local mode for an invalid local URL (%s)", async (path) => {
    await renderAuthPage(path);

    expect(createLocalAccount).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Welcome to FavLock");
  });

  it("opens signup options directly and keeps signup when returning from email", async () => {
    await renderAuthPage("/login?mode=sign-up&next=%2Fcheckout");
    expect(container.querySelector("h1,h2")?.textContent).toBe("Create your account");
    expect(findButton(container, "Continue with Google")).toBeDefined();
    expect(container.querySelector('input[type="email"]')).toBeNull();
    const signIn = Array.from(container.querySelectorAll("a")).find((link) => link.textContent === "Sign in")!;
    expect(signIn.getAttribute("href")).toBe("/login?next=%2Fcheckout");
    await openEmailSignIn();
    expect(container.querySelector("#email-sign-up-tab")?.getAttribute("aria-selected")).toBe("true");
    await act(async () => findButton(container, "Back to options").click());
    expect(container.textContent).toContain("Create your account");
    await act(async () => signIn.click());
    expect(container.textContent).toContain("Welcome to FavLock");
    await act(async () => findButton(container, "Browser back").click());
    expect(container.textContent).toContain("Create your account");
  });

  it.each(["sign-in", "sign-up"])("places confirmation recovery after the legal notice in %s", async (mode) => {
    await renderAuthPage(`/login?mode=${mode}&next=%2Fcheckout`);
    const links = Array.from(container.querySelectorAll("a"));
    const confirmation = links.find((link) => link.textContent === "Need another confirmation email?")!;
    const privacy = links.find((link) => link.textContent?.includes("Privacy Policy"))!;
    expect(privacy.compareDocumentPosition(confirmation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await act(async () => confirmation.click());
    expect(container.querySelector("[data-location]")?.textContent).toBe("/login?next=%2Fcheckout&confirmation=1");
    expect(container.textContent).toContain("Request a new link for the email you used to sign up.");
  });

  it("follows browser history without reusing passwords or CAPTCHA across modes", async () => {
    await renderAuthPage("/login?mode=sign-up&next=%2Fcheckout");
    await openEmailSignIn();
    await fillSignUpForm();
    await completeSecurityCheck();
    await act(async () => findButton(container, "Sign in").click());
    expect(container.querySelector("[data-location]")?.textContent).toBe("/login?next=%2Fcheckout");
    await act(async () => findButton(container, "Browser back").click());
    expect(container.querySelector("#email-sign-up-tab")?.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector<HTMLInputElement>('input[autocomplete="new-password"]')?.value).toBe("");
    expect(findButton(container, "Create account with email").disabled).toBe(true);
    await act(async () => findButton(container, "Browser forward").click());
    expect(container.querySelector("#email-sign-in-tab")?.getAttribute("aria-selected")).toBe("true");
  });

  it.each(["mode=unknown", "mode=sign-up&mode=sign-in", "mode=sign-up&reconnect=1"])(
    "safely defaults to email sign-in for %s", async (search) => {
      await renderAuthPage(`/login?${search}&next=%2Fcheckout`);
      await openEmailSignIn();
      expect(container.querySelector("#email-sign-in-tab")?.getAttribute("aria-selected")).toBe("true");
      expect(container.querySelector('input[autocomplete="given-name"]')).toBeNull();
      if (search.includes("reconnect")) {
        expect(findButton(container, "Create account").disabled).toBe(true);
        await act(async () => findButton(container, "Sign in").dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
        expect(container.querySelector("#email-sign-in-tab")?.getAttribute("aria-selected")).toBe("true");
        expect(container.textContent).toContain("Your local library stays on this device");
      }
      expect(signUp).not.toHaveBeenCalled();
    },
  );

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
    ).toBeNull();
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
    vi.useFakeTimers();
    signUp.mockResolvedValue({
      data: { user: { id: "user-1" }, session: null },
      error: null,
    });
    resend.mockResolvedValue({ data: {}, error: null });

    await renderAuthPage("/login?mode=sign-up&next=%2Fcheckout");
    await openEmailSignIn();
    await fillSignUpForm();
    await completeSecurityCheck();
    await submitForm();

    expect(signUp).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "secret123",
      options: {
        captchaToken: "turnstile-token",
        emailRedirectTo: expect.stringMatching(/\/checkout$/),
      },
    });
    expect(container.textContent).toContain("Check your inbox");
    expect(container.textContent).toContain("ada@example.com");
    expect(container.textContent).toContain("You are not signed in yet");
    expect(container.textContent).toContain("browser and profile");
    expect(container.querySelector("[data-location]")?.textContent).toBe("/login?mode=sign-up&next=%2Fcheckout");
    expect(findButton(container, "Resend available in 60s").disabled).toBe(true);

    await completeSecurityCheck();
    expect(resend).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
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
      "Request accepted. If this address needs confirmation",
    );
    expect(findButton(container, "Resend available in 60s").disabled).toBe(true);
    await act(async () => findButton(container, "Back to sign in").click());
    expect(container.querySelector("[data-location]")?.textContent).toBe("/login?next=%2Fcheckout");
    expect(container.querySelector("#email-sign-in-tab")?.getAttribute("aria-selected")).toBe("true");
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

  it("continues directly to checkout when email signup returns a usable session", async () => {
    signUp.mockResolvedValue({ data: { session: { user: { id: "user-1" } } }, error: null });
    await renderAuthPage("/login?mode=sign-up&next=%2Fcheckout");
    await openEmailSignIn();
    await fillSignUpForm();
    await completeSecurityCheck();
    await submitForm();
    expect(container.querySelector("[data-location]")?.textContent).toBe("/checkout");
    expect(container.textContent).not.toContain("Check your inbox");
  });

  it("preserves Pro checkout through Google authentication", async () => {
    signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    await renderAuthPage("/login?mode=sign-up&next=%2Fcheckout");

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

  it("preserves Pro checkout through Apple authentication", async () => {
    signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    await renderAuthPage("/login?mode=sign-up&next=%2Fcheckout");

    await act(async () => {
      findButton(container, "Continue with Apple").click();
    });

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "apple",
      options: {
        redirectTo: expect.stringMatching(/\/checkout$/),
      },
    });
  });

  it("does not pass untrusted destinations to Google", async () => {
    signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    await renderAuthPage("/login?mode=sign-up&next=https%3A%2F%2Fattacker.example");
    await act(async () => findButton(container, "Continue with Google").click());
    expect(signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: expect.stringMatching(/^https?:\/\/[^/]+\/$/) } });
  });

  it("does not pass untrusted destinations to Apple", async () => {
    signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    await renderAuthPage("/login?mode=sign-up&next=https%3A%2F%2Fattacker.example");
    await act(async () => findButton(container, "Continue with Apple").click());
    expect(signInWithOAuth).toHaveBeenCalledWith({ provider: "apple", options: { redirectTo: expect.stringMatching(/^https?:\/\/[^/]+\/$/) } });
  });

  it("does not render raw OAuth descriptions (the callback boundary handles safe categories)", async () => {
    window.history.replaceState(
      {},
      "",
      "/login#error_description=Disposable%20email%20addresses%20are%20not%20allowed%20for%20new%20FavLock%20accounts.%20If%20this%20is%20a%20mistake%2C%20contact%20support%40favlock.app.",
    );

    await renderAuthPage();

    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("offers confirmation recovery after unconfirmed password sign-in without claiming email delivery", async () => {
    signInWithPassword.mockResolvedValue({ data: { session: null }, error: { code: "email_not_confirmed", message: "Confirm your email address before signing in." } });
    await renderAuthPage("/login?next=%2Fcheckout&reconnect=1");
    await openEmailSignIn();
    await fillSignUpForm();
    await completeSecurityCheck();
    await submitForm();
    expect(container.textContent).toContain("Confirm your email");
    expect(container.textContent).not.toContain("Check your inbox");
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(resend).not.toHaveBeenCalled();
    await act(async () => findButton(container, "Back to sign in").click());
    expect(container.querySelector("[data-location]")?.textContent).toBe("/login?next=%2Fcheckout&reconnect=1");
  });

  it.each(["rate_limited", "interrupted"])("recovers a lost waiting screen and handles resend %s safely", async (failure) => {
    vi.useFakeTimers();
    if (failure === "rate_limited") resend.mockResolvedValue({ error: { code: failure, message: "Too many requests." } });
    else resend.mockRejectedValue(new Error("private network details"));
    await renderAuthPage("/login?confirmation=1&next=%2Fcheckout");
    const input = container.querySelector<HTMLInputElement>('input[name="confirmationEmail"]')!;
    await act(async () => setInputValue(input, "ada@example.com"));
    await completeSecurityCheck();
    await act(async () => findButton(container, "Resend confirmation email").click());
    expect(resend).toHaveBeenCalledOnce();
    expect(resend).toHaveBeenCalledWith(expect.objectContaining({ email: "ada@example.com", options: expect.objectContaining({ emailRedirectTo: expect.stringMatching(/\/checkout$/) }) }));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(failure === "rate_limited" ? "Wait at least a minute" : "Check your inbox before trying again");
    expect(container.textContent).not.toContain("private network details");
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(findButton(container, "Resend confirmation email").disabled).toBe(true);
    await completeSecurityCheck();
    expect(findButton(container, "Resend confirmation email").disabled).toBe(false);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("blocks repeated resend and changing email while the request is in flight", async () => {
    let finish!: (value: unknown) => void;
    resend.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await renderAuthPage("/login?confirmation=1");
    await act(async () => setInputValue(container.querySelector<HTMLInputElement>('input[name="confirmationEmail"]')!, "ada@example.com"));
    await completeSecurityCheck();
    await act(async () => findButton(container, "Resend confirmation email").click());
    expect(findButton(container, "Sending...").disabled).toBe(true);
    expect(findButton(container, "Use a different email").disabled).toBe(true);
    await act(async () => findButton(container, "Sending...").click());
    expect(resend).toHaveBeenCalledOnce();
    await act(async () => finish({ data: {}, error: null }));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Request accepted");
  });
});
