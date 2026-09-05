import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthCallbackBoundary from "./AuthCallbackBoundary";

const { useAuth, getCallbackFailure } = vi.hoisted(() => ({ useAuth: vi.fn(), getCallbackFailure: vi.fn() }));
vi.mock("../context/useAuth", () => ({ useAuth }));
vi.mock("../lib/favLockAuth", () => ({ favLockAuth: { getCallbackFailure } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AuthCallbackBoundary", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    useAuth.mockReturnValue({ loading: false, user: null });
    getCallbackFailure.mockReturnValue(null);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  async function render(path = "/checkout?code=fake-code&view=compact") {
    await act(async () => root.render(<MemoryRouter initialEntries={[path]}><AuthCallbackBoundary>Protected route</AuthCallbackBoundary></MemoryRouter>));
  }

  it.each(["cancelled", "invalid_link", "missing_state", "unsupported_callback", "account_changed", "provider_error"])("offers safe next steps for %s before protected routing", async (failure) => {
    getCallbackFailure.mockReturnValue(failure);
    await render();
    expect(container.textContent).not.toContain("Protected route");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Retry this link");
    expect(container.querySelector('a[href="/login?next=%2Fcheckout%3Fview%3Dcompact"]')).not.toBeNull();
    expect(Array.from(container.querySelectorAll("a"), (link) => link.getAttribute("href"))).toContain("/login?next=%2Fcheckout%3Fview%3Dcompact&confirmation=1");
    expect(container.innerHTML).not.toContain("fake-code");
  });

  it.each(["cancelled", "provider_error"])("keeps %s guidance provider-neutral", async (failure) => {
    getCallbackFailure.mockReturnValue(failure);
    await render();
    expect(container.textContent).not.toContain("Google");
    expect(container.textContent).not.toContain("Apple");
    expect(container.textContent.toLowerCase()).toContain("sign-in");
  });

  it.each(["temporarily_unavailable", "storage_unavailable"])("keeps %s retry on the original callback document", async (failure) => {
    getCallbackFailure.mockReturnValue(failure);
    await render();
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(reload).toHaveBeenCalledOnce();
  });

  it("preserves reconnect identity and does not offer account creation or data deletion", async () => {
    useAuth.mockReturnValue({ loading: false, user: { id: "existing-user" } });
    getCallbackFailure.mockReturnValue("account_changed");
    localStorage.setItem("callback-vault-sentinel", "preserved");
    await render();
    expect(Array.from(container.querySelectorAll("a"), (link) => link.getAttribute("href"))).toContain("/login?next=%2Fcheckout%3Fview%3Dcompact&reconnect=1");
    expect(container.textContent).toContain("Back to local library");
    expect(container.textContent).not.toContain("Request a new confirmation email");
    expect(localStorage.getItem("callback-vault-sentinel")).toBe("preserved");
    localStorage.removeItem("callback-vault-sentinel");
  });

  it("retains reviewed email-rejection guidance and support links", async () => {
    getCallbackFailure.mockReturnValue("email_rejected");
    await render();
    expect(container.querySelector('a[href$="/terms#disposable-email-addresses"]')).not.toBeNull();
    expect(container.querySelector('a[href="mailto:support@favlock.app"]')).not.toBeNull();
  });

  it("leaves successful returning users on their existing protected route", async () => {
    useAuth.mockReturnValue({ loading: false, user: { id: "returning-user" } });
    await render();
    expect(container.textContent).toBe("Protected route");
  });

  it("leaves password recovery with its existing reset flow", async () => {
    getCallbackFailure.mockReturnValue("invalid_link");
    await render("/reset-password?code=fake-recovery-code");
    expect(container.textContent).toBe("Protected route");
  });
});
