import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
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
vi.mock("../lib/appUrls", () => ({
  CREEM_PRO_PRODUCT_URL: "https://creem.io/payment/prod_pro",
}));

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
    expect(container.textContent).toContain("10,000 bookmarks");
    expect(
      Array.from(container.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Upgrade to Pro"),
      ),
    ).toBe(true);
    expect(container.textContent).toContain("merchant of record");
  });

  it("shows the portal and period-end cancellation state for paid accounts", async () => {
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
    expect(container.textContent).toContain("Receipts & billing");
    expect(container.textContent).toContain("will end");
    expect(
      Array.from(container.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Upgrade to Pro"),
      ),
    ).toBe(false);
  });
});
