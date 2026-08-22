const CREEM_CUSTOMER_PORTAL_URL = "https://www.creem.io/my-orders/login";

function trustedCreemUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "creem.io" && !url.hostname.endsWith(".creem.io"))
  ) {
    throw new Error("The Creem product link is invalid.");
  }
  return url;
}

export function buildCreemCheckoutUrl(
  productUrl: string,
  userId: string,
): string {
  if (!productUrl.trim()) {
    throw new Error("Pro checkout is not configured yet.");
  }

  const url = trustedCreemUrl(productUrl);
  url.searchParams.set("metadata[userId]", userId);
  return url.toString();
}

export function getCreemCustomerPortalUrl(): string {
  return CREEM_CUSTOMER_PORTAL_URL;
}
