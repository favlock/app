import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicOnlyRoute from "./PublicOnlyRoute";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("../context/useAuth", () => ({ useAuth }));

describe("PublicOnlyRoute", () => {
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
});
