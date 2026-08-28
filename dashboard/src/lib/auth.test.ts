import type { AuthUser } from "./favLockAuth";
import { describe, expect, it } from "vitest";
import {
  getAccountDisplayName,
  getProfileNamesFromUser,
  hasPasswordSignIn,
} from "./auth";

describe("auth helpers", () => {
  it.each([
    [{ first_name: " Ada ", last_name: " Lovelace " }, "other@example.com", "Ada Lovelace"],
    [{ first_name: "Ada", last_name: "" }, "other@example.com", "Ada"],
    [{ first_name: "", last_name: "Lovelace" }, "other@example.com", "Lovelace"],
    [{ first_name: "", last_name: "" }, "alex@example.com", "alex"],
    [{ first_name: " ", last_name: "  " }, "alex+work@example.com", "alex+work"],
    [{ first_name: null, last_name: null }, "alex@example.com", "alex"],
    [null, "alex@example.com", "alex"],
    [undefined, "alex@example.com", "alex"],
    [null, undefined, "User"],
    [null, "", "User"],
  ])("uses an email prefix only as an account display fallback (%#)", (profile, email, expected) => {
    expect(getAccountDisplayName(profile, email)).toBe(expected);
  });

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

  it.each([
    [{}, { firstName: "", lastName: "" }],
    [{ first_name: " ", last_name: "" }, { firstName: "", lastName: "" }],
    [{ last_name: " Lovelace " }, { firstName: "", lastName: "Lovelace" }],
    [{ full_name: "Grace Hopper" }, { firstName: "Grace", lastName: "Hopper" }],
    [{ given_name: "Ada", family_name: "Lovelace" }, { firstName: "Ada", lastName: "Lovelace" }],
  ])("uses only supplied profile names, never the email prefix (%#)", (user_metadata, expected) => {
    const user = { email: "not-a-name@example.com", user_metadata } as unknown as AuthUser;
    expect(getProfileNamesFromUser(user)).toEqual(expected);
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
