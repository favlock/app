import { describe, expect, it } from "vitest";
import {
  PRODUCTION_API_URL,
} from "../../scripts/configure-chrome-extension.mjs";

describe("production Chrome API configuration", () => {
  it("uses the fixed public FavLock API origin", () => {
    expect(PRODUCTION_API_URL).toBe("https://api.favlock.app/");
  });
});
