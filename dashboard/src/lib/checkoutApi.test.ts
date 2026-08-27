import { afterEach, describe, expect, it, vi } from "vitest";
import { createProCheckout, validatedCheckoutUrl } from "./checkoutApi";

afterEach(() => vi.unstubAllGlobals());

describe("server-owned checkout", () => {
  it.each([
    "https://checkout.creem.io/ch_abc123",
    "https://creem.io/payment/prod_test?checkout_id=ch_test",
    "https://creem.io/test/payment/prod_test?checkout_id=ch_test",
    "https://creem.io/checkout/prod_test/ch_test",
    "https://creem.io/checkout/prod_test/ch_test/?theme=dark",
    "https://www.creem.io/payment/prod_test",
    "https://www.creem.io/test/payment/prod_test",
  ])("accepts the payment URL %s while sending only an attempt ID and bearer", async (url) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { checkoutUrl: url } })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createProCheckout("bearer", "11111111-1111-4111-8111-111111111111")).resolves.toBe(url);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/v1\/billing\/checkout$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ attemptId: "11111111-1111-4111-8111-111111111111" });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer bearer");
  });

  it("preserves checkout query parameters and normalizes the approved bare hostname", () => {
    expect(validatedCheckoutUrl("https://CREEM.IO:443/payment/prod_test-123/?checkout_id=ch_test&theme=dark"))
      .toBe("https://creem.io/payment/prod_test-123/?checkout_id=ch_test&theme=dark");
    expect(validatedCheckoutUrl("https://CREEM.IO:443/checkout/prod_test123/ch_test123/?theme=dark"))
      .toBe("https://creem.io/checkout/prod_test123/ch_test123/?theme=dark");
  });

  it.each([
    "http://creem.io/checkout/prod_test/ch_test",
    "https://creem.io.evil.test/checkout/prod_test/ch_test",
    "https://evil.creem.io/checkout/prod_test/ch_test",
    "https://creem.io@evil.test/checkout/prod_test/ch_test",
    "https://user:password@creem.io/checkout/prod_test/ch_test",
    "https://creem.io:444/checkout/prod_test/ch_test",
    "https://creem.io/checkout/prod_test/ch_test#secret",
    "https://www.creem.io/checkout/prod_test/ch_test",
    "https://checkout.creem.io/checkout/prod_test/ch_test",
    "https://creem.io/checkout/prod_test",
    "https://creem.io/checkout/prod_/ch_test",
    "https://creem.io/checkout/prod_test/ch_",
    "https://creem.io/checkout/product_test/ch_test",
    "https://creem.io/checkout/prod_test/checkout_test",
    "https://creem.io/checkout/ch_test/prod_test",
    "https://creem.io/checkout/prod_test/ch_test/extra",
    "https://creem.io/checkout/prod_test//ch_test",
    "https://creem.io/checkout/prod_test/ch_test//",
    "https://creem.io/checkout/prod_test%2Fextra/ch_test",
    "https://creem.io/checkout/prod_test/ch_test%5Cextra",
    "https://creem.io/checkout/prod_test/ch_test%3Fsecret",
    "https://creem.io/checkout/prod_" + "a".repeat(129) + "/ch_test",
    "https://creem.io/checkout/prod_test/ch_" + "a".repeat(129),
  ])("rejects unsafe or malformed product/checkout destinations: %s", (url) => {
    expect(() => validatedCheckoutUrl(url)).toThrow();
  });

  it.each([
    "http://creem.io/payment/prod_test", "https://creem.io.evil.test/payment/prod_test",
    "https://evil.creem.io/payment/prod_test", "https://creem.io@evil.test/payment/prod_test",
    "https://user:password@creem.io/payment/prod_test", "https://creem.io:444/payment/prod_test",
    "https://creem.io/payment/prod_test#secret", "https://creem.io/", "https://creem.io/login",
    "https://creem.io/store/prod_test", "https://creem.io/payment/", "https://creem.io/payment/prod_test/extra",
    "https://creem.io/payment/prod_test%2Fextra", "https://creem.io/payment/prod_test%5Cextra",
  ])("still rejects an unsafe or unrelated bare-domain destination %s", (url) => {
    expect(() => validatedCheckoutUrl(url)).toThrow();
  });

  it.each(["https://evil.creem.io/ch_a", "http://checkout.creem.io/ch_a", "https://checkout.creem.io.evil.test/ch_a", "https://user@www.creem.io/payment/a", "https://www.creem.io/payment/a#secret", "javascript:alert(1)"])("rejects an untrusted redirect %s", (url) => {
    expect(() => validatedCheckoutUrl(url)).toThrow();
  });

  it("never retries a failed or uncertain checkout automatically", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createProCheckout("bearer", crypto.randomUUID())).rejects.toThrow("could not be confirmed");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
