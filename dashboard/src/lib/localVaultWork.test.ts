import { describe, expect, it } from "vitest";
import { cancelLocalVaultWork, captureLocalVaultWork, trackLocalVaultWork } from "./localVaultWork";

describe("explicit local cleanup", () => {
  it("invalidates old work immediately and waits for pending storage writes before clearing", async () => {
    const guard = captureLocalVaultWork("a");
    const other = captureLocalVaultWork("b");
    let finish!: () => void;
    trackLocalVaultWork("a", new Promise<void>((resolve) => { finish = resolve; }));
    let cleared = false;
    const cleanup = cancelLocalVaultWork("a").then(() => { cleared = true; });
    expect(guard).toThrow("cancelled");
    expect(other).not.toThrow();
    await Promise.resolve();
    expect(cleared).toBe(false);
    finish();
    await cleanup;
    expect(cleared).toBe(true);
    expect(captureLocalVaultWork("a")).not.toThrow();
  });
});
