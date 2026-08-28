import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicOnlyRoute from "./PublicOnlyRoute";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("../context/useAuth", () => ({ useAuth }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("PublicOnlyRoute", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    act(() => root.unmount());
    container.remove();
  });

  it("sends an existing session from registration to Pro checkout", async () => {
    useAuth.mockReturnValue({ user: { id: "user-1" }, loading: false });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/register?next=%2Fcheckout"]}>
          <Routes>
            <Route
              path="/register"
              element={
                <PublicOnlyRoute>
                  Registration
                </PublicOnlyRoute>
              }
            />
            <Route path="/checkout" element="Checkout" />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toBe("Checkout");
  });

  it("allows cloud reconnection without signing out the local account", async () => {
    useAuth.mockReturnValue({ user: { id: "user-1" }, loading: false, cloudStatus: "reconnect_required" });
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/login?reconnect=1"]}><PublicOnlyRoute>Reconnect</PublicOnlyRoute></MemoryRouter>);
    });
    expect(container.textContent).toBe("Reconnect");
  });

  it.each(["available", "offline", "reconnect_required", "restricted", "unavailable"])(
    "keeps the existing %s account when a signup link is opened", async (cloudStatus) => {
      const signOut = vi.fn();
      useAuth.mockReturnValue({ user: { id: "user-1" }, loading: false, cloudStatus, signOut });
      localStorage.setItem("signup-local-vault-sentinel", "preserved");
      await act(async () => root.render(
        <MemoryRouter initialEntries={["/login?mode=sign-up&next=%2Fcheckout"]}>
          <Routes>
            <Route path="/login" element={<PublicOnlyRoute>Signup</PublicOnlyRoute>} />
            <Route path="/checkout" element="Checkout" />
          </Routes>
        </MemoryRouter>,
      ));
      expect(container.textContent).toBe("Checkout");
      expect(signOut).not.toHaveBeenCalled();
      expect(localStorage.getItem("signup-local-vault-sentinel")).toBe("preserved");
      localStorage.removeItem("signup-local-vault-sentinel");
    },
  );

  it.each(["reconnect_required", "available"])("honors explicit reconnect with signup intent when cloud is %s", async (cloudStatus) => {
    useAuth.mockReturnValue({ user: { id: "user-1" }, loading: false, cloudStatus });
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/login?mode=sign-up&reconnect=1&next=%2Fcheckout"]}>
        <Routes>
          <Route path="/login" element={<PublicOnlyRoute>Reconnect</PublicOnlyRoute>} />
          <Route path="/checkout" element="Checkout" />
        </Routes>
      </MemoryRouter>,
    ));
    expect(container.textContent).toBe(cloudStatus === "available" ? "Checkout" : "Reconnect");
  });

  it("waits for session and callback initialization before showing signup", async () => {
    useAuth.mockReturnValue({ user: null, loading: true });
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/login?mode=sign-up"]}><PublicOnlyRoute>Signup</PublicOnlyRoute></MemoryRouter>,
    ));
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Loading...");
    expect(container.textContent).not.toContain("Signup");
  });

  it("sends an existing session to the dashboard for untrusted redirects", async () => {
    useAuth.mockReturnValue({ user: { id: "user-1" }, loading: false });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/login?next=https://example.com"]}>
          <Routes>
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  Sign in
                </PublicOnlyRoute>
              }
            />
            <Route path="/" element="Dashboard" />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toBe("Dashboard");
  });

  it.each([
    "Your account changed in another tab. Reload to continue.",
    "Could not open your saved session. Check this browser's storage settings and reload FavLock.",
    "The sign-in link is invalid or has expired.",
  ])("surfaces the connection error and retains sign-in content: %s", async (connectionError) => {
    useAuth.mockReturnValue({ user: null, loading: false, cloudStatus: "signed_out", connectionError });
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/login"]}><PublicOnlyRoute>Sign in form</PublicOnlyRoute></MemoryRouter>,
    ));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(connectionError);
    expect(container.textContent).toContain("Sign in form");
    expect(container.querySelector("button")?.textContent).toBe("Reload FavLock");
  });

  it("reloads the document when the user chooses to restore account state", async () => {
    useAuth.mockReturnValue({ user: null, loading: false, cloudStatus: "signed_out", connectionError: "Your account changed in another tab. Reload to continue." });
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/login"]}><PublicOnlyRoute>Sign in form</PublicOnlyRoute></MemoryRouter>,
    ));
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    await act(async () => container.querySelector<HTMLButtonElement>("button")?.click());

    expect(reload).toHaveBeenCalledOnce();
  });
});
