import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPageModule, PageLoadError, PAGE_LOAD_RETRY_DELAY_MS } from "./pageLoad";

describe("page module loading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns a successful import without retrying", async () => {
    const module = { default: "page" };
    const load = vi.fn().mockResolvedValue(module);
    expect(await loadPageModule(load)).toBe(module);
    expect(load).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    "Failed to fetch dynamically imported module: https://example.test/assets/Notes-old.js",
    "Importing a module script failed.",
    "error loading dynamically imported module: https://example.test/assets/Notes-old.js",
    "Unable to preload CSS for /assets/Notes-old.css",
  ])("retries a transient browser download failure: %s", async (message) => {
    const module = { default: "page" };
    const load = vi.fn().mockRejectedValueOnce(new TypeError(message)).mockResolvedValue(module);
    const result = loadPageModule(load);
    await vi.advanceTimersByTimeAsync(PAGE_LOAD_RETRY_DELAY_MS - 1);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe(module);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("stops after two attempts for a missing deployed file", async () => {
    const load = vi.fn().mockRejectedValue(new TypeError("Importing a module script failed."));
    const assertion = expect(loadPageModule(load)).rejects.toBeInstanceOf(PageLoadError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(load).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry an offline failure", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const load = vi.fn().mockRejectedValue(new TypeError("Importing a module script failed."));
    await expect(loadPageModule(load)).rejects.toBeInstanceOf(PageLoadError);
    expect(load).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows an already cached module to load offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const module = { default: "page" };
    await expect(loadPageModule(async () => module)).resolves.toBe(module);
  });

  it("does not retry if connectivity disappears during the delay", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const load = vi.fn().mockRejectedValue(new TypeError("Importing a module script failed."));
    const assertion = expect(loadPageModule(load)).rejects.toBeInstanceOf(PageLoadError);
    await vi.advanceTimersByTimeAsync(1);
    online.mockReturnValue(false);
    await vi.runAllTimersAsync();
    await assertion;
    expect(load).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Error("render failed"),
    new TypeError("Failed to fetch"),
    new SyntaxError("Unexpected token"),
    "Importing a module script failed.",
  ])("does not misclassify or retry unrelated errors: %s", async (error) => {
    const load = vi.fn().mockRejectedValue(error);
    await expect(loadPageModule(load)).rejects.toBe(error);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
