import {
  fetchAuthenticatedJson,
  postAuthenticatedJsonWithoutBody,
} from "./authenticatedApi";

const OVERVIEW_ERROR = "We could not load your billing details. Please try again.";
const TRANSACTIONS_ERROR = "We could not load your payment history. Please try again.";
const CANCEL_ERROR = "Your subscription could not be canceled. Please try again.";
const RESUME_ERROR = "Your subscription could not be renewed. Please try again.";
const PORTAL_ERROR = "Creem billing could not be opened. Please try again.";

export interface BillingPlanSummary {
  productName: string;
  amount: number;
  currency: string;
  billingPeriod: string | null;
}

export interface BillingOverview {
  status: string;
  plan: BillingPlanSummary | null;
  currentPeriodEnd: string | null;
  nextPaymentAt: string | null;
  canceledAt: string | null;
}

export interface BillingTransaction {
  id: string;
  orderId: string | null;
  description: string | null;
  status: string;
  amount: number;
  amountPaid: number | null;
  taxAmount: number | null;
  refundedAmount: number | null;
  currency: string;
  createdAt: string;
}

export interface BillingTransactionPage {
  items: BillingTransaction[];
  page: number;
  totalPages: number;
}

type Fields = Record<string, unknown>;

function fields(value: unknown): Fields | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Fields)
    : null;
}

function dataOf(payload: unknown, message: string): unknown {
  const response = fields(payload);
  if (!response || !("data" in response)) throw new Error(message);
  return response.data;
}

const isString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
const isNullableString = (value: unknown): value is string | null =>
  value === null || isString(value);
const isInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);
const isNullableInteger = (value: unknown): value is number | null =>
  value === null || isInteger(value);
const isCurrency = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Z]{3}$/.test(value);

function parsePlan(value: unknown): BillingPlanSummary | null {
  if (value === null) return null;
  const plan = fields(value);
  if (
    !plan ||
    !isString(plan.productName) ||
    !isInteger(plan.amount) ||
    !isCurrency(plan.currency) ||
    !isNullableString(plan.billingPeriod)
  ) {
    throw new Error(OVERVIEW_ERROR);
  }
  return {
    productName: plan.productName,
    amount: plan.amount,
    currency: plan.currency,
    billingPeriod: plan.billingPeriod,
  };
}

export function parseBillingOverview(payload: unknown): BillingOverview | null {
  const data = dataOf(payload, OVERVIEW_ERROR);
  if (data === null) return null;
  const overview = fields(data);
  if (
    !overview ||
    !isString(overview.status) ||
    !isNullableString(overview.currentPeriodEnd) ||
    !isNullableString(overview.nextPaymentAt) ||
    !isNullableString(overview.canceledAt)
  ) {
    throw new Error(OVERVIEW_ERROR);
  }
  return {
    status: overview.status,
    plan: parsePlan(overview.plan),
    currentPeriodEnd: overview.currentPeriodEnd,
    nextPaymentAt: overview.nextPaymentAt,
    canceledAt: overview.canceledAt,
  };
}

function parseTransaction(value: unknown): BillingTransaction {
  const item = fields(value);
  if (
    !item ||
    !isString(item.id) ||
    !isNullableString(item.orderId) ||
    !isNullableString(item.description) ||
    !isString(item.status) ||
    !isInteger(item.amount) ||
    !isNullableInteger(item.amountPaid) ||
    !isNullableInteger(item.taxAmount) ||
    !isNullableInteger(item.refundedAmount) ||
    !isCurrency(item.currency) ||
    !isString(item.createdAt)
  ) {
    throw new Error(TRANSACTIONS_ERROR);
  }
  return {
    id: item.id,
    orderId: item.orderId,
    description: item.description,
    status: item.status,
    amount: item.amount,
    amountPaid: item.amountPaid,
    taxAmount: item.taxAmount,
    refundedAmount: item.refundedAmount,
    currency: item.currency,
    createdAt: item.createdAt,
  };
}

export function parseBillingTransactions(payload: unknown): BillingTransactionPage {
  const page = fields(dataOf(payload, TRANSACTIONS_ERROR));
  if (
    !page ||
    !Array.isArray(page.items) ||
    !isInteger(page.page) ||
    page.page < 1 ||
    !isInteger(page.totalPages) ||
    page.totalPages < 0
  ) {
    throw new Error(TRANSACTIONS_ERROR);
  }
  return {
    items: page.items.map(parseTransaction),
    page: page.page,
    totalPages: page.totalPages,
  };
}

export function validatedPortalUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) throw new Error(PORTAL_ERROR);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(PORTAL_ERROR);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !["creem.io", "www.creem.io"].includes(url.hostname) ||
    !/^\/(?:test\/)?my-orders\/[A-Za-z0-9/_-]{1,512}$/.test(url.pathname)
  ) {
    throw new Error(PORTAL_ERROR);
  }
  return url.toString();
}

export async function fetchBillingOverview(
  accessToken: string,
): Promise<BillingOverview | null> {
  return parseBillingOverview(
    await fetchAuthenticatedJson("/v1/billing/overview", accessToken, OVERVIEW_ERROR),
  );
}

export async function fetchBillingTransactions(
  accessToken: string,
  page: number,
): Promise<BillingTransactionPage> {
  return parseBillingTransactions(
    await fetchAuthenticatedJson(
      `/v1/billing/transactions?page=${encodeURIComponent(String(page))}`,
      accessToken,
      TRANSACTIONS_ERROR,
    ),
  );
}

export async function cancelSubscriptionAtPeriodEnd(
  accessToken: string,
): Promise<void> {
  const data = fields(
    dataOf(
      await postAuthenticatedJsonWithoutBody("/v1/billing/cancel", accessToken, CANCEL_ERROR),
      CANCEL_ERROR,
    ),
  );
  if (!data || !isString(data.status)) throw new Error(CANCEL_ERROR);
}

export async function resumeSubscription(accessToken: string): Promise<void> {
  const data = fields(
    dataOf(
      await postAuthenticatedJsonWithoutBody("/v1/billing/resume", accessToken, RESUME_ERROR),
      RESUME_ERROR,
    ),
  );
  if (!data || !isString(data.status)) throw new Error(RESUME_ERROR);
}

export async function createBillingPortalLink(accessToken: string): Promise<string> {
  const data = fields(
    dataOf(
      await postAuthenticatedJsonWithoutBody("/v1/billing/portal", accessToken, PORTAL_ERROR),
      PORTAL_ERROR,
    ),
  );
  return validatedPortalUrl(data?.portalUrl);
}

export function formatMoney(amountInMinorUnits: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
      amountInMinorUnits / 100,
    );
  } catch {
    return `${(amountInMinorUnits / 100).toFixed(2)} ${currency}`;
  }
}
