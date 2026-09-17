import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LibraryHealthProGate from "./LibraryHealthProGate";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  accountPlan: { id: "free", name: "Free" } as
    | { id: string; name: string }
    | undefined,
  isError: false,
  isLoading: false,
  isLocalAccount: false,
  refetch: vi.fn(),
  setIsMobileSidebarOpen: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useOutletContext: () => ({
    setIsMobileSidebarOpen: mocks.setIsMobileSidebarOpen,
  }),
}));

vi.mock("../hooks/useAccountPlanQuery", () => ({
  useAccountPlan: () => ({
    data: mocks.accountPlan,
    isError: mocks.isError,
    isLoading: mocks.isLoading,
    refetch: mocks.refetch,
  }),
}));
vi.mock("../context/useAuth", () => ({
  useAuth: () => ({ isLocalAccount: mocks.isLocalAccount }),
}));

describe("LibraryHealthProGate", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.accountPlan = { id: "free", name: "Free" };
    mocks.isError = false;
    mocks.isLoading = false;
    mocks.isLocalAccount = false;
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderGate() {
    await act(async () => {
      root.render(
        <LibraryHealthProGate>
          <div>Protected health tools</div>
        </LibraryHealthProGate>,
      );
    });
  }

  it("shows the upgrade state instead of health tools for Free accounts", async () => {
    await renderGate();

    expect(container.textContent).toContain(
      "Library health is included with Pro",
    );
    expect(container.textContent).not.toContain("Protected health tools");
    expect(container.querySelector('a[href="/checkout"]')).not.toBeNull();
  });

  it("renders health tools for Pro accounts", async () => {
    mocks.accountPlan = { id: "pro", name: "Pro" };
    await renderGate();

    expect(container.textContent).toContain("Protected health tools");
    expect(container.textContent).not.toContain(
      "Library health is included with Pro",
    );
  });

  it("sends local vaults through the established cloud connection flow", async () => {
    mocks.accountPlan = { id: "local", name: "Local" };
    mocks.isLocalAccount = true;
    await renderGate();

    expect(container.textContent).toContain(
      "Library health requires a Pro cloud account",
    );
    expect(
      container.querySelector(
        'a[href="/login?mode=sign-in&reconnect=1&merge=1"]',
      ),
    ).not.toBeNull();
  });
});
