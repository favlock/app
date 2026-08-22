import type { AuthUser } from "./favLockAuth";
import { describe, expect, it } from "vitest";
import {
  getProfileNamesFromUser,
  hasPasswordSignIn,
} from "./auth";

describe("auth helpers", () => {
  it("reads profile names saved during email registration", () => {
    const user = {
      email: "ada@example.com",
      user_metadata: { first_name: "Ada", last_name: "Lovelace" },
    } as unknown as AuthUser;

    expect(getProfileNamesFromUser(user)).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("recognizes password sign-in from an email identity", () => {
    const user = {
      app_metadata: { providers: ["google", "email"] },
      user_metadata: {},
      identities: [{ provider: "google" }, { provider: "email" }],
    } as unknown as AuthUser;

    expect(hasPasswordSignIn(user)).toBe(true);
  });

  it("recognizes password sign-in saved for a Google account", () => {
    const user = {
      app_metadata: { provider: "google", providers: ["google"] },
      user_metadata: { password_sign_in_enabled: true },
      identities: [{ provider: "google" }],
    } as unknown as AuthUser;

    expect(hasPasswordSignIn(user)).toBe(true);
  });

  it("recognizes a Google account without a password", () => {
    const user = {
      app_metadata: { provider: "google", providers: ["google"] },
      user_metadata: {},
      identities: [{ provider: "google" }],
    } as unknown as AuthUser;

    expect(hasPasswordSignIn(user)).toBe(false);
  });
});
