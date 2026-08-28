import { describe, expect, it } from "vitest";
import {
  buildAuthPath,
  getAuthMode,
  getDashboardRedirectUrl,
  getPostAuthPath,
  normalizePostAuthPath,
} from "./authNavigation";

describe("authentication navigation", () => {
  it.each([
    ["", "sign-in"], ["mode=sign-in", "sign-in"], ["mode=sign-up", "sign-up"],
    ["mode=unknown", "sign-in"], ["mode=SIGN-UP", "sign-in"],
    ["mode=sign-up&mode=sign-in", "sign-in"],
    ["mode=sign-up&reconnect=1", "sign-in"],
  ])("normalizes auth intent %s to %s", (search, mode) => {
    expect(getAuthMode(new URLSearchParams(search))).toBe(mode);
  });

  it.each([
    "/checkout", "/write", "/settings#security", "/extension/pair?pairing=example",
    "/c/reading", "/t/design", "/favorites", "/notes", "/todos", "/tasks/",
  ])("preserves the approved destination %s through both modes", (next) => {
    for (const mode of ["sign-in", "sign-up"] as const) {
      const path = buildAuthPath("/login", next, { mode });
      const params = new URL(path, "https://vault.example").searchParams;
      expect(getPostAuthPath(params)).toBe(next);
      expect(getAuthMode(params)).toBe(mode);
    }
  });

  it.each([
    "https://attacker.example", "//attacker.example", "/\\attacker.example",
    "javascript:alert(1)", "/unknown", "/login/", "/register", "/reset-password",
    "/checkout/../login", "/%2f%2fattacker.example", "/c/%2fescape",
    "/checkout\n", "/checkout?" + "a".repeat(2048),
  ])("rejects unsafe or unknown destination %s", (next) => {
    expect(normalizePostAuthPath(next)).toBe("/");
    expect(buildAuthPath("/login", next, { mode: "sign-up" })).toBe("/login?mode=sign-up");
  });

  it("keeps reconnect intent and rejects ambiguous next parameters", () => {
    expect(buildAuthPath("/login", "/checkout", { mode: "sign-up", reconnect: true }))
      .toBe("/login?next=%2Fcheckout&reconnect=1");
    expect(getPostAuthPath(new URLSearchParams("next=/checkout&next=/write"))).toBe("/");
  });

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
