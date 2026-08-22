import { describe, expect, it } from "vitest";
import { readAuthUrl } from "./authUrl";

describe("public Auth URL configuration", () => {
  it("accepts an HTTPS Auth origin for production", () => {
    expect(readAuthUrl("https://auth.favlock.example/", true)).toBe(
      "https://auth.favlock.example",
    );
  });

  it("accepts the existing provider Auth origin in production", () => {
    expect(readAuthUrl("https://project.supabase.co", true)).toBe(
      "https://project.supabase.co",
    );
  });

  it.each([
    [undefined, "required"],
    ["ftp://auth.favlock.example", "http or https"],
    ["http://auth.favlock.example", "https in production"],
    ["https://user@auth.favlock.example", "must be an origin"],
    ["https://auth.favlock.example/auth", "must be an origin"],
    ["https://auth.favlock.example?next=/", "must be an origin"],
  ])("rejects unsafe production Auth URL %s", (value, message) => {
    expect(() => readAuthUrl(value, true)).toThrow(message);
  });
});
