import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BillingManagementSection from "./BillingManagementSection";

const {
  useAccountPlan,
  useBillingSubscription,
  useAuth,
  useBillingOverview,
  useBillingTransactions,
  resumeSubscription,
  cancelSubscriptionAtPeriodEnd,
  createBillingPortalLink,
} = vi.hoisted(() => ({
  useAccountPlan: vi.fn(),
  useBillingSubscription: vi.fn(),
  useAuth: vi.fn(),
  useBillingOverview: vi.fn(),
  useBillingTransactions: vi.fn(),
  resumeSubscription: vi.fn(),
  cancelSubscriptionAtPeriodEnd: vi.fn(),
  createBillingPortalLink: vi.fn(),
}));

vi.mock("../context/useAuth", () => ({ useAuth }));
vi.mock("../hooks/useAccountPlanQuery", () => ({ useAccountPlan }));
vi.mock("../hooks/useBillingSubscriptionQuery", () => ({
  useBillingSubscription,
  billingSubscriptionQueryKey: (userId: string | undefined) => ["billing-subscription", userId],
}));
vi.mock("../hooks/useBillingManagementQuery", () => ({
  useBillingOverview,
  useBillingTransactions,
  billingOverviewQueryKey: (userId: string | undefined) => ["billing-overview", userId],
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("../lib/favLockAuth", () => ({ favLockAuth: { getLocalUser: vi.fn() } }));
vi.mock("../lib/billingManagementApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/billingManagementApi")>()),
  resumeSubscription,
  cancelSubscriptionAtPeriodEnd,
  createBillingPortalLink,
}));
vi.mock("./ConfirmDialog", () => ({
  default: ({ open, confirmLabel, onConfirm }: {
    open: boolean;
    confirmLabel: string;
    onConfirm: () => void;
  }) => (open ? <button type="button" onClick={onConfirm}>Confirm {confirmLabel}</button> : null),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("BillingManagementSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { id: "4e640f6a-43c9-4e21-a434-dc9c42d5a79e" },
      session: { access_token: "caller-token" },
    });
    resumeSubscription.mockReset();
    cancelSubscriptionAtPeriodEnd.mockReset();
    createBillingPortalLink.mockReset();
    useAccountPlan.mockReturnValue({ data: { id: "free" } });
    useBillingSubscription.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    });
    useBillingOverview.mockReturnValue({ data: undefined });
    useBillingTransactions.mockReturnValue({
      data: { items: [], page: 1, totalPages: 0 },
      isLoading: false,
      isError: false,
      isFetching: false,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderSection() {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <BillingManagementSection />
        </MemoryRouter>,
      );
    });
  }

  const findButton = (label: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === label,
    );
  const hasButton = (label: string) => findButton(label) !== undefined;

  function mockSubscription(status: string, cancelAtPeriodEnd = false) {
    useBillingSubscription.mockReturnValue({
      data: {
        provider: "creem",
        status,
        currentPeriodEnd: "2026-11-07T00:00:00.000Z",
        cancelAtPeriodEnd,
      },
      isLoading: false,
      isError: false,
    });
    useBillingOverview.mockReturnValue({
      data: {
        status,
        plan: { productName: "FavLock Pro", amount: 1900, currency: "USD", billingPeriod: "every-year" },
        currentPeriodEnd: "2026-11-07T00:00:00.000Z",
        nextPaymentAt: "2026-11-07T00:00:00.000Z",
        canceledAt: null,
      },
    });
  }

  function mockScheduledCancel() {
    useAccountPlan.mockReturnValue({ data: { id: "pro" } });
    useBillingSubscription.mockReturnValue({
      data: {
        provider: "creem",
        status: "scheduled_cancel",
        currentPeriodEnd: "2026-09-06T00:00:00.000Z",
        cancelAtPeriodEnd: true,
      },
      isLoading: false,
      isError: false,
    });
  }

  it("shows plan pricing, payment history and cancellation for active Creem subscriptions", async () => {
    useAccountPlan.mockReturnValue({ data: { id: "pro" } });
    useBillingSubscription.mockReturnValue({
      data: {
        provider: "creem",
        status: "active",
        currentPeriodEnd: "2026-11-07T00:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
      isLoading: false,
      isError: false,
    });
    useBillingOverview.mockReturnValue({
      data: {
        status: "active",
        plan: { productName: "FavLock Pro", amount: 500, currency: "USD", billingPeriod: "every-month" },
        currentPeriodEnd: "2026-11-07T00:00:00.000Z",
        nextPaymentAt: "2026-11-07T00:00:00.000Z",
        canceledAt: null,
      },
    });
    useBillingTransactions.mockReturnValue({
      data: {
        items: [{
          id: "tran_1", orderId: "ord_1", description: null, status: "paid", amount: 500,
          amountPaid: 500, taxAmount: 0, refundedAmount: null, currency: "USD",
          createdAt: "2026-10-07T00:00:00.000Z",
        }],
        page: 1,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
      isFetching: false,
    });

    await renderSection();

    expect(container.textContent).toContain("FavLock Pro");
    expect(container.textContent).toContain("/ month");
    expect(container.textContent).toContain("Next payment");
    expect(container.textContent).toContain("Payment history");
    expect(container.textContent).toContain("Order ord_1");
    expect(useBillingOverview).toHaveBeenCalledWith(true);
    expect(hasButton("Receipts & billing")).toBe(true);
    expect(hasButton("Cancel subscription")).toBe(true);
    expect(hasButton("Renew subscription")).toBe(false);
  });

  it("shows the end date instead of the next payment once cancellation is scheduled", async () => {
    useAccountPlan.mockReturnValue({ data: { id: "pro" } });
    useBillingSubscription.mockReturnValue({
      data: {
        provider: "creem",
        status: "scheduled_cancel",
        currentPeriodEnd: "2026-09-06T00:00:00.000Z",
        cancelAtPeriodEnd: true,
      },
      isLoading: false,
      isError: false,
    });
    useBillingOverview.mockReturnValue({
      data: {
        status: "scheduled_cancel",
        plan: { productName: "FavLock Pro", amount: 1900, currency: "USD", billingPeriod: "every-year" },
        currentPeriodEnd: "2026-09-06T00:00:00.000Z",
        nextPaymentAt: "2026-09-06T00:00:00.000Z",
        canceledAt: null,
      },
    });

    await renderSection();

    expect(container.textContent).toContain("/ year");
    expect(container.textContent).toContain("will end");
    expect(container.textContent).not.toContain("Next payment");
    expect(hasButton("Cancel subscription")).toBe(false);
    expect(findButton("Renew subscription")?.className).toContain("theme-button-primary");
  });

  it("renews a scheduled cancellation and hides the button while Creem confirms", async () => {
    mockScheduledCancel();
    resumeSubscription.mockResolvedValue(undefined);
    await renderSection();

    await act(async () => {
      findButton("Renew subscription")!.click();
    });

    expect(resumeSubscription).toHaveBeenCalledWith("caller-token");
    expect(hasButton("Renew subscription")).toBe(false);
    expect(container.textContent).toContain("Your subscription is renewed");
    expect(container.textContent).not.toContain("will end");
  });

  it("keeps the renew button and shows the error when renewal fails", async () => {
    mockScheduledCancel();
    resumeSubscription.mockRejectedValue(
      new Error("Your subscription could not be renewed. Please try again."),
    );
    await renderSection();

    await act(async () => {
      findButton("Renew subscription")!.click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Your subscription could not be renewed. Please try again.",
    );
    expect(hasButton("Renew subscription")).toBe(true);
    expect(container.textContent).toContain("will end");
  });

  it("points Free accounts without a subscription to the plans", async () => {
    await renderSection();

    expect(container.textContent).toContain("No active subscription");
    expect(container.textContent).toContain("You're on the Free plan.");
    expect(
      container.querySelector<HTMLAnchorElement>('a[href="/settings/usage"]')?.textContent,
    ).toBe("Compare plans");
    expect(hasButton("Receipts & billing")).toBe(true);
    expect(container.textContent).not.toContain("Payment history");
    expect(hasButton("Cancel subscription")).toBe(false);
    expect(useBillingOverview).toHaveBeenCalledWith(false);
  });

  it("explains Pro access that is not billed through Creem", async () => {
    useAccountPlan.mockReturnValue({ data: { id: "pro" } });

    await renderSection();

    expect(container.textContent).toContain("not connected to a Creem subscription");
    expect(container.querySelector('a[href="/settings/usage"]')).toBeNull();
  });

  it("shows the requested cancellation and hides Cancel while Creem confirms", async () => {
    useAccountPlan.mockReturnValue({ data: { id: "pro" } });
    mockSubscription("active");
    cancelSubscriptionAtPeriodEnd.mockResolvedValue(undefined);
    await renderSection();
    expect(container.textContent).toContain("Next payment");

    await act(async () => {
      findButton("Cancel subscription")!.click();
    });
    await act(async () => {
      findButton("Confirm Cancel subscription")!.click();
    });

    expect(cancelSubscriptionAtPeriodEnd).toHaveBeenCalledWith("caller-token");
    expect(hasButton("Cancel subscription")).toBe(false);
    expect(container.textContent).toContain("will end");
    expect(container.textContent).not.toContain("Next payment");
  });

  it("offers a payment method update while a payment is past due", async () => {
    useAccountPlan.mockReturnValue({ data: { id: "pro" } });
    mockSubscription("past_due");
    await renderSection();

    expect(container.textContent).toContain("FavLock Pro");
    expect(container.textContent).toContain("A payment needs attention");
    expect(findButton("Update payment method")?.className).toContain("theme-button-primary");
    expect(hasButton("Cancel subscription")).toBe(true);
  });

  it.each(["expired", "unpaid"])(
    "treats a %s subscription as needing payment, not as Pro",
    async (status) => {
      mockSubscription(status);
      createBillingPortalLink.mockResolvedValue("https://creem.io/my-orders/login/abc");
      const portalWindow = { opener: {}, location: { href: "" } };
      const open = vi.spyOn(window, "open").mockReturnValue(portalWindow as unknown as Window);
      await renderSection();

      expect(container.textContent).toContain("Payment needed");
      expect(container.textContent).not.toContain("FavLock Pro");
      expect(container.textContent).not.toContain("/ year");
      expect(container.querySelector('a[href="/settings/usage"]')).toBeNull();
      expect(hasButton("Cancel subscription")).toBe(false);

      await act(async () => {
        findButton("Update payment method")!.click();
      });

      expect(createBillingPortalLink).toHaveBeenCalledWith("caller-token");
      expect(portalWindow.location.href).toBe("https://creem.io/my-orders/login/abc");
      open.mockRestore();
    },
  );

  it.each([
    ["paused", "Subscription paused"],
    ["refunded", "Subscription refunded"],
    ["disputed", "Payment under review"],
    ["unknown_status", "Subscription needs attention"],
  ])("points a %s subscription to support", async (status, title) => {
    mockSubscription(status);
    await renderSection();

    expect(container.textContent).toContain(title);
    expect(container.textContent).not.toContain("FavLock Pro");
    expect(container.querySelector('a[href="/support"]')?.textContent).toBe("Contact support");
    expect(container.querySelector('a[href="/settings/usage"]')).toBeNull();
    expect(hasButton("Update payment method")).toBe(false);
    expect(hasButton("Cancel subscription")).toBe(false);
  });

  it("points an ended subscription back to the plans", async () => {
    mockSubscription("canceled");
    await renderSection();

    expect(container.textContent).toContain("No active subscription");
    expect(container.textContent).toContain("has ended");
    expect(container.querySelector('a[href="/settings/usage"]')?.textContent).toBe("Compare plans");
  });
});
