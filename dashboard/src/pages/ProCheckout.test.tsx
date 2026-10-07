import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProCheckout from "./ProCheckout";

const { useAuth, useAccountPlan, useBillingSubscription, createProCheckout } = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useAccountPlan: vi.fn(),
  useBillingSubscription: vi.fn(),
  createProCheckout: vi.fn(),
}));

vi.mock("../context/useAuth", () => ({ useAuth }));
vi.mock("../hooks/useAccountPlanQuery", () => ({ useAccountPlan }));
vi.mock("../hooks/useBillingSubscriptionQuery", () => ({ useBillingSubscription }));
vi.mock("../lib/checkoutApi", () => ({ createProCheckout }));
vi.mock("../lib/favLockAuth", () => ({ favLockAuth: { getLocalUser: vi.fn() } }));
vi.mock("../components/ui/auth-layout", () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("ProCheckout", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { id: "4e640f6a-43c9-4e21-a434-dc9c42d5a79e" },
      session: { access_token: "caller-token" },
    });
    useAccountPlan.mockReturnValue({ data: { id: "free" }, isLoading: false });
    useBillingSubscription.mockReturnValue({ data: null, isLoading: false });
    createProCheckout.mockReset();
    createProCheckout.mockReturnValue(new Promise(() => {}));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderCheckout() {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/checkout"]}>
          <Routes>
            <Route path="/checkout" element={<ProCheckout />} />
            <Route path="/settings/usage" element={<p>Plan and usage</p>} />
            <Route path="/settings/billing" element={<p>Billing</p>} />
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  it("sends Pro accounts to Plan & usage without starting a checkout", async () => {
    useAccountPlan.mockReturnValue({ data: { id: "pro" }, isLoading: false });
    useBillingSubscription.mockReturnValue({
      data: { provider: "creem", status: "active", currentPeriodEnd: null, cancelAtPeriodEnd: false },
      isLoading: false,
    });
    await renderCheckout();

    expect(container.textContent).toBe("Plan and usage");
    expect(createProCheckout).not.toHaveBeenCalled();
  });

  it.each(["expired", "unpaid", "past_due", "refunded", "disputed", "paused"])(
    "sends a Free account with a %s subscription to Billing",
    async (status) => {
      useBillingSubscription.mockReturnValue({
        data: { provider: "creem", status, currentPeriodEnd: null, cancelAtPeriodEnd: false },
        isLoading: false,
      });
      await renderCheckout();

      expect(container.textContent).toBe("Billing");
      expect(createProCheckout).not.toHaveBeenCalled();
    },
  );

  it("waits for the plan and subscription before starting a checkout", async () => {
    useAccountPlan.mockReturnValue({ data: undefined, isLoading: true });
    await renderCheckout();

    expect(container.textContent).toContain("Opening checkout");
    expect(createProCheckout).not.toHaveBeenCalled();
  });

  it.each([
    ["no subscription", null],
    ["a canceled subscription", { provider: "creem", status: "canceled", currentPeriodEnd: null, cancelAtPeriodEnd: false }],
  ])("starts a checkout for a Free account with %s", async (_label, subscription) => {
    useBillingSubscription.mockReturnValue({ data: subscription, isLoading: false });
    await renderCheckout();

    expect(createProCheckout).toHaveBeenCalledOnce();
    expect(createProCheckout.mock.calls[0]?.[0]).toBe("caller-token");
  });

  it("shows the server's reason when checkout is refused", async () => {
    createProCheckout.mockRejectedValue(new Error("Manage your existing plan in billing settings."));
    await renderCheckout();

    expect(container.textContent).toContain("Checkout unavailable");
    expect(container.textContent).toContain("Manage your existing plan in billing settings.");
  });
});
