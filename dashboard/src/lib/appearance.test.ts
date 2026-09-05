import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APPEARANCE_STORAGE_KEY, getAppearance, initializeAppearance, setAppearance, subscribeAppearance } from "./appearance";

describe("appearance preference", () => {
  let media: EventTarget & { matches: boolean };
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    localStorage.clear();
    media = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal("matchMedia", vi.fn(() => media));
  });
  afterEach(() => {
    dispose?.();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.appearance;
  });

  it("defaults to Auto and follows live device changes", () => {
    dispose = initializeAppearance();
    expect(getAppearance()).toBe("auto");
    expect(document.documentElement.dataset.appearance).toBe("light");
    media.matches = true;
    media.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset.appearance).toBe("dark");
  });

  it("restores an explicit choice and ignores device changes until Auto is selected", () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, "dark");
    dispose = initializeAppearance();
    expect(document.documentElement.dataset.appearance).toBe("dark");
    media.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset.appearance).toBe("dark");
    setAppearance("light");
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("light");
    media.matches = true;
    media.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset.appearance).toBe("light");
    setAppearance("auto");
    expect(document.documentElement.dataset.appearance).toBe("dark");
  });

  it("updates subscribed controls when another tab changes or clears the preference", () => {
    dispose = initializeAppearance();
    const listener = vi.fn();
    const unsubscribe = subscribeAppearance(listener);
    localStorage.setItem(APPEARANCE_STORAGE_KEY, "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: APPEARANCE_STORAGE_KEY }));
    expect(getAppearance()).toBe("dark");
    expect(listener).toHaveBeenCalledOnce();
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(getAppearance()).toBe("auto");
    unsubscribe();
  });

  it("falls back to Auto for invalid storage and remains usable when storage is blocked", () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, "invalid");
    dispose = initializeAppearance();
    expect(getAppearance()).toBe("auto");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => setAppearance("dark")).not.toThrow();
    expect(document.documentElement.dataset.appearance).toBe("dark");
  });

  it("removes device listeners on cleanup", () => {
    dispose = initializeAppearance();
    dispose();
    media.matches = true;
    media.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset.appearance).toBe("light");
  });
});


describe("appearance before first paint", () => {
  const bootstrap = readFileSync("public/appearance.js", "utf8");
  it.each([
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["auto", true, "dark"],
    [null, false, "light"],
    ["invalid", true, "dark"],
  ])("resolves %s with device dark=%s to %s", (stored, deviceDark, expected) => {
    const document = { documentElement: { dataset: { appearance: "" } } };
    runInNewContext(bootstrap, {
      document,
      localStorage: { getItem: () => stored },
      window: { matchMedia: () => ({ matches: deviceDark }) },
    });
    expect(document.documentElement.dataset.appearance).toBe(expected);
  });
});
