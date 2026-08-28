import { postAuthenticatedJson } from "./authenticatedApi";

export function validatedCheckoutUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) throw new Error("Invalid checkout destination.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
    !(url.hostname === "checkout.creem.io" && /^\/ch_[A-Za-z0-9]+\/?$/.test(url.pathname) ||
      (url.hostname === "www.creem.io" || url.hostname === "creem.io") && /^\/(?:test\/)?payment\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) ||
      url.hostname === "creem.io" && /^\/checkout\/prod_[A-Za-z0-9]{1,128}\/ch_[A-Za-z0-9]{1,128}\/?$/.test(url.pathname))) {
    throw new Error("Invalid checkout destination.");
  }
  return url.toString();
}

export async function createProCheckout(accessToken: string, attemptId: string): Promise<string> {
  const result = await postAuthenticatedJson("/v1/billing/checkout", accessToken, { attemptId },
    "Checkout could not be confirmed. Check Receipts & billing before trying again.");
  const data = result && typeof result === "object" && "data" in result ? result.data : null;
  return validatedCheckoutUrl(data && typeof data === "object" && "checkoutUrl" in data ? data.checkoutUrl : null);
}
