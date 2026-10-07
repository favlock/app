import { describe, expect, it, vi } from "vitest";
import { postAuthenticatedJsonWithoutBody } from "./authenticatedApi";
import {
  formatMoney,
  parseBillingOverview,
  parseBillingTransactions,
  resumeSubscription,
  validatedPortalUrl,
} from "./billingManagementApi";

vi.mock("./authenticatedApi", () => ({
  fetchAuthenticatedJson: vi.fn(),
  postAuthenticatedJsonWithoutBody: vi.fn(),
}));

const transaction = {
  id: "tran_1",
  orderId: "ord_1",
  description: null,
  status: "paid",
  amount: 500,
  amountPaid: 500,
  taxAmount: 0,
  refundedAmount: null,
  currency: "USD",
  createdAt: "2026-10-07T00:00:00.000Z",
};

describe("billing management API parsing", () => {
  it("accepts an overview and a missing billing account", () => {
    expect(parseBillingOverview({ data: null })).toBeNull();
    expect(
      parseBillingOverview({
        data: {
          status: "active",
          plan: { productName: "FavLock Pro", amount: 500, currency: "USD", billingPeriod: "every-month" },
          currentPeriodEnd: null,
          nextPaymentAt: "2026-11-07T00:00:00.000Z",
          canceledAt: null,
        },
      }),
    ).toMatchObject({ status: "active", plan: { amount: 500 } });
  });

  it.each([
    {},
    { data: { status: "" } },
    { data: { status: "active", plan: { productName: "Pro", amount: "5", currency: "USD", billingPeriod: null },
      currentPeriodEnd: null, nextPaymentAt: null, canceledAt: null } },
  ])("rejects malformed overviews %#", (payload) => {
    expect(() => parseBillingOverview(payload)).toThrow();
  });

  it("parses transaction pages and rejects malformed rows", () => {
    expect(parseBillingTransactions({ data: { items: [transaction], page: 1, totalPages: 1 } }).items).toHaveLength(1);
    expect(() =>
      parseBillingTransactions({ data: { items: [{ ...transaction, amount: 5.5 }], page: 1, totalPages: 1 } }),
    ).toThrow();
    expect(() =>
      parseBillingTransactions({ data: { items: [{ ...transaction, currency: "usd" }], page: 1, totalPages: 1 } }),
    ).toThrow();
    expect(() => parseBillingTransactions({ data: { items: [], page: 0, totalPages: 0 } })).toThrow();
  });

  it("accepts only Creem customer portal URLs", () => {
    expect(validatedPortalUrl("https://creem.io/my-orders/login/abc123")).toBe(
      "https://creem.io/my-orders/login/abc123",
    );
    for (const value of [
      "javascript:alert(1)",
      "http://creem.io/my-orders/login/abc",
      "https://creem.io.evil.example/my-orders/login/abc",
      "https://evil.example/my-orders/login/abc",
      "https://creem.io/checkout/abc",
      "https://user@creem.io/my-orders/login/abc",
      null,
    ]) {
      expect(() => validatedPortalUrl(value)).toThrow();
    }
  });

  it("formats minor currency units", () => {
    expect(formatMoney(500, "USD")).toMatch(/5[.,]00/);
  });

  it("renews through the resume route with only the caller token", async () => {
    vi.mocked(postAuthenticatedJsonWithoutBody).mockResolvedValue({
      data: { status: "active", currentPeriodEnd: null },
    });
    await expect(resumeSubscription("caller-token")).resolves.toBeUndefined();
    expect(postAuthenticatedJsonWithoutBody).toHaveBeenCalledWith(
      "/v1/billing/resume",
      "caller-token",
      "Your subscription could not be renewed. Please try again.",
    );
  });

  it.each([{}, { data: null }, { data: { status: 1 } }])(
    "rejects a malformed renewal response %#",
    async (payload) => {
      vi.mocked(postAuthenticatedJsonWithoutBody).mockResolvedValue(payload);
      await expect(resumeSubscription("caller-token")).rejects.toThrow(
        "Your subscription could not be renewed.",
      );
    },
  );
});
