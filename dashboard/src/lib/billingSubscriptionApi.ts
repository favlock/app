import { fetchAuthenticatedJson } from "./authenticatedApi";

const BILLING_SUBSCRIPTION_ERROR =
  "We could not load your subscription. Please try again.";

export interface BillingSubscription {
  provider: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

function parseBillingSubscription(
  value: unknown,
): BillingSubscription | null {
  if (!value || typeof value !== "object") {
    throw new Error(BILLING_SUBSCRIPTION_ERROR);
  }
  const response = value as Record<string, unknown>;
  if (response.data === null) return null;
  if (!response.data || typeof response.data !== "object") {
    throw new Error(BILLING_SUBSCRIPTION_ERROR);
  }

  const subscription = response.data as Record<string, unknown>;
  if (
    typeof subscription.provider !== "string" ||
    !subscription.provider ||
    typeof subscription.status !== "string" ||
    !subscription.status ||
    (subscription.currentPeriodEnd !== null &&
      typeof subscription.currentPeriodEnd !== "string") ||
    typeof subscription.cancelAtPeriodEnd !== "boolean"
  ) {
    throw new Error(BILLING_SUBSCRIPTION_ERROR);
  }

  return {
    provider: subscription.provider,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  };
}

export async function fetchBillingSubscription(
  accessToken: string,
): Promise<BillingSubscription | null> {
  const payload = await fetchAuthenticatedJson(
    "/v1/account/subscription",
    accessToken,
    BILLING_SUBSCRIPTION_ERROR,
  );
  return parseBillingSubscription(payload);
}
