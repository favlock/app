import { describe, expect, it } from "vitest";
import {
  DEFAULT_USE_FAVLOCK_NEW_TAB,
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
});
