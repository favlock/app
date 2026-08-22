import { describe, expect, it } from "vitest";
import { isPasswordRecoveryRedirectUrl } from "./authRecovery";

describe("password recovery redirects", () => {
  it("recognizes PKCE recovery codes on the reset page", () => {
    expect(
      isPasswordRecoveryRedirectUrl(
        "https://vault.favlock.app/reset-password?code=recovery-code",
      ),
    ).toBe(true);
  });

  it("recognizes implicit recovery redirects", () => {
    expect(
      isPasswordRecoveryRedirectUrl(
        "https://vault.favlock.app/reset-password#access_token=token&type=recovery",
      ),
    ).toBe(true);
  });

  it("does not treat unrelated OAuth codes as password recovery", () => {
    expect(
      isPasswordRecoveryRedirectUrl(
        "https://vault.favlock.app/login?code=oauth-code",
      ),
    ).toBe(false);
  });
});
