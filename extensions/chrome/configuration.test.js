import { describe, expect, it } from "vitest";
import {
  assertProductionAuthUrl,
  PRODUCTION_API_URL,
} from "../../scripts/configure-chrome-extension.mjs";

describe("production Chrome API configuration", () => {
  it("uses the fixed public FavLock API origin", () => {
    expect(PRODUCTION_API_URL).toBe("https://api.favlock.app/");
  });
});

describe("production Chrome Auth URL configuration", () => {
  it.each([
    "https://auth.favlock.example",
    "https://project.supabase.co",
  ])("accepts a safe HTTPS Auth origin: %s", (value) => {
    expect(() =>
      assertProductionAuthUrl(value),
    ).not.toThrow();
  });

  it.each([
    "http://auth.favlock.example",
    "https://auth.favlock.example/path",
    "https://user@auth.favlock.example",
  ])("rejects an unsafe production Auth URL: %s", (value) => {
    expect(() => assertProductionAuthUrl(value)).toThrow();
  });
});
