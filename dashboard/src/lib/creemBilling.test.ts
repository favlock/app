import { describe, expect, it } from "vitest";
import {
  buildCreemCheckoutUrl,
  getCreemCustomerPortalUrl,
} from "./creemBilling";

describe("Creem billing links", () => {
  it("adds the FavLock user ID as checkout metadata", () => {
    const url = new URL(
      buildCreemCheckoutUrl(
        "https://creem.io/payment/prod_pro?theme=dark",
        "4e640f6a-43c9-4e21-a434-dc9c42d5a79e",
      ),
    );

    expect(url.searchParams.get("metadata[userId]")).toBe(
      "4e640f6a-43c9-4e21-a434-dc9c42d5a79e",
    );
    expect(url.searchParams.get("theme")).toBe("dark");
  });

  it("rejects product links outside Creem", () => {
    expect(() =>
      buildCreemCheckoutUrl(
        "https://example.com/payment/prod_pro",
        "4e640f6a-43c9-4e21-a434-dc9c42d5a79e",
      ),
    ).toThrow("invalid");
  });

  it("uses Creem's hosted receipt and subscription portal", () => {
    expect(getCreemCustomerPortalUrl()).toBe(
      "https://www.creem.io/my-orders/login",
    );
  });
});
