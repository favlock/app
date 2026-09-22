import { describe, expect, it } from "vitest";
import { parseCloudSortPreferences } from "./sortPreferencesApi";
const preferences = { order: "saved-desc", favoritesFirst: false, bookmarksOnly: true };
describe("cloud sorting response validation", () => {
  it("accepts device mode and strips unrecognized cloud response fields", () => {
    expect(parseCloudSortPreferences({ data: { preferences: null, version: 0 } })).toEqual({ preferences: null, version: 0 });
    expect(parseCloudSortPreferences({ data: { preferences: { ...preferences, owner: "ignore" }, version: 2, secret: "ignore" } })).toEqual({ preferences, version: 2 });
  });
  it.each([
    null,
    { data: { preferences, version: "1" } },
    { data: { preferences, version: -1 } },
    { data: { preferences: { ...preferences, order: "invalid" }, version: 1 } },
    { data: { preferences: { ...preferences, favoritesFirst: "true" }, version: 1 } },
    { data: { preferences: {}, version: 1 } },
  ])("rejects malformed settings %#", (value) => {
    expect(() => parseCloudSortPreferences(value)).toThrow("Could not sync sorting");
  });
});
