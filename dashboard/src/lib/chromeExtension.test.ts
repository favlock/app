import { describe, expect, it } from "vitest";
import { isGoogleChrome } from "./chromeExtension";

describe("Chrome extension browser detection", () => {
  it("recognizes desktop Google Chrome", () => {
    expect(
      isGoogleChrome(
        "Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
        "Google Inc.",
      ),
    ).toBe(true);
  });

  it("excludes other Chromium browsers and non-Google vendors", () => {
    expect(
      isGoogleChrome(
        "Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
        "Google Inc.",
      ),
    ).toBe(false);
    expect(
      isGoogleChrome(
        "Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
        "Apple Computer, Inc.",
      ),
    ).toBe(false);
  });
});
