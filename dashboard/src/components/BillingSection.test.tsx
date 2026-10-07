import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BillingSection from "./BillingSection";

const { useAccountPlan, useBillingSubscription, useAuth } = vi.hoisted(() => ({
  useAccountPlan: vi.fn(),
  useBillingSubscription: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("../context/useAuth", () => ({ useAuth }));
vi.mock("../hooks/useAccountPlanQuery", () => ({ useAccountPlan }));
vi.mock("../hooks/useBillingSubscriptionQuery", () => ({
  useBillingSubscription,
}));
vi.mock("../lib/checkoutApi", () => ({ createProCheckout: vi.fn() }));
vi.mock("../lib/favLockAuth", () => ({ favLockAuth: { getLocalUser: vi.fn() } }));

describe("BillingSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { id: "4e640f6a-43c9-4e21-a434-dc9c42d5a79e" },
    });
    useAccountPlan.mockReturnValue({
      data: { id: "free" },
      refetch: vi.fn(),
    });
    useBillingSubscription.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("offers Free accounts a Pro upgrade", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <BillingSection />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("Upgrade to Pro");
    expect(container.textContent).toContain("Unlimited bookmarks");
    expect(
      Array.from(container.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Upgrade to Pro"),
      ),
    ).toBe(true);
    expect(container.textContent).toContain("merchant of record");
  });

  it("links paid accounts to billing and shows period-end cancellation", async () => {
    useAccountPlan.mockReturnValue({
      data: { id: "pro" },
      refetch: vi.fn(),
    });
    useBillingSubscription.mockReturnValue({
      data: {
        provider: "creem",
        status: "scheduled_cancel",
        currentPeriodEnd: "2026-09-06T00:00:00.000Z",
        cancelAtPeriodEnd: true,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <BillingSection />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("FavLock Pro");
    expect(container.textContent).toContain("Manage billing");
    expect(container.textContent).not.toContain("Receipts & billing");
    expect(container.textContent).not.toContain("Cancel subscription");
    expect(container.textContent).toContain("will end");
    expect(
      Array.from(container.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Upgrade to Pro"),
      ),
    ).toBe(false);
  });

  it("opens the Billing tab from Manage billing", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/settings/usage"]}>
          <Routes>
            <Route path="/settings/usage" element={<BillingSection />} />
            <Route path="/settings/billing" element={<p>Billing tab</p>} />
          </Routes>
        </MemoryRouter>,
      );
    });

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Manage billing"))!
        .click();
    });

    expect(container.textContent).toBe("Billing tab");
  });

  it.each(["expired", "unpaid", "paused", "refunded", "disputed"])(
    "explains why a %s subscription blocks a new checkout",
    async (status) => {
      useBillingSubscription.mockReturnValue({
        data: { provider: "creem", status, currentPeriodEnd: null, cancelAtPeriodEnd: false },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      await act(async () => {
        root.render(
          <MemoryRouter>
            <BillingSection />
          </MemoryRouter>,
        );
      });

      const upgrade = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Upgrade to Pro"),
      );
      expect(upgrade?.disabled).toBe(true);
      expect(container.textContent).toContain("needs attention before you can start a new one");
    },
  );

  it("lets a canceled subscription start a new checkout", async () => {
    useAuth.mockReturnValue({
      user: { id: "4e640f6a-43c9-4e21-a434-dc9c42d5a79e" },
      session: { access_token: "caller-token" },
    });
    useBillingSubscription.mockReturnValue({
      data: { provider: "creem", status: "canceled", currentPeriodEnd: null, cancelAtPeriodEnd: false },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    await act(async () => {
      root.render(
        <MemoryRouter>
          <BillingSection />
        </MemoryRouter>,
      );
    });

    const upgrade = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Upgrade to Pro"),
    );
    expect(upgrade?.disabled).toBe(false);
    expect(container.textContent).toContain("not active");
    expect(container.textContent).not.toContain("needs attention");
  });
});
