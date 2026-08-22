import { describe, expect, it } from "vitest";
import {
  buildAuthPath,
  getDashboardRedirectUrl,
  getPostAuthPath,
  normalizePostAuthPath,
} from "./authNavigation";

describe("authentication navigation", () => {
  it("preserves same-origin extension destinations", () => {
    const next = "/?addUrl=https%3A%2F%2Fexample.com&addTitle=Example";

    expect(normalizePostAuthPath(next)).toBe(next);
    expect(buildAuthPath("/login", next)).toBe(
      `/login?next=${encodeURIComponent(next)}`,
    );
    expect(getPostAuthPath(new URLSearchParams({ next }))).toBe(next);
    expect(getDashboardRedirectUrl(next)).toContain(next);
  });

  it("rejects external and public-auth destinations", () => {
    expect(normalizePostAuthPath("https://example.com")).toBe("/");
    expect(normalizePostAuthPath("//example.com/path")).toBe("/");
    expect(normalizePostAuthPath("/login?next=/checkout")).toBe("/");
  });
});
