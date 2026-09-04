import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHOW_HIGHLIGHTS_ON_WEBPAGES,
  DEFAULT_USE_FAVLOCK_NEW_TAB,
  resolveShowHighlightsOnWebpages,
  resolveUseFavLockNewTab,
} from "./extension-settings.js";

describe("extension settings", () => {
  it("keeps FavLock new tabs off until a new user opts in", () => {
    expect(DEFAULT_USE_FAVLOCK_NEW_TAB).toBe(false);
    expect(resolveUseFavLockNewTab(undefined)).toBe(false);
  });

  it("preserves an existing explicit new-tab choice", () => {
    expect(resolveUseFavLockNewTab(true)).toBe(true);
    expect(resolveUseFavLockNewTab(false)).toBe(false);
  });

  it("enables webpage highlight marks by default", () => {
    expect(DEFAULT_SHOW_HIGHLIGHTS_ON_WEBPAGES).toBe(true);
    expect(resolveShowHighlightsOnWebpages(undefined)).toBe(true);
  });

  it("preserves an explicit webpage highlight choice", () => {
    expect(resolveShowHighlightsOnWebpages(true)).toBe(true);
    expect(resolveShowHighlightsOnWebpages(false)).toBe(false);
  });
});
