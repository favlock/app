import { describe, expect, it, vi } from "vitest";
import { CloudAccessError } from "./cloudAccess";
import { RATE_LIMIT_RETRY_DELAYS_MS, withRateLimitRetry } from "./rateLimitRetry";

const rateLimited = () => new CloudAccessError("rate_limited", "Too many requests");

describe("withRateLimitRetry", () => {
  it("waits and retries rate-limited requests until they succeed", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(rateLimited())
      .mockRejectedValueOnce(rateLimited())
      .mockResolvedValue("done");
    const waits: number[] = [];

    await expect(withRateLimitRetry(operation, {
      wait: async (delayMs) => { waits.push(delayMs); },
    })).resolves.toBe("done");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(waits).toEqual(RATE_LIMIT_RETRY_DELAYS_MS.slice(0, 2));
  });

  it("does not retry other failures, which may have committed", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("timeout"));

    await expect(withRateLimitRetry(operation, { wait: async () => {} })).rejects.toThrow("timeout");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("gives up after the bounded retry schedule", async () => {
    const operation = vi.fn().mockRejectedValue(rateLimited());

    await expect(withRateLimitRetry(operation, { wait: async () => {} })).rejects.toThrow("Too many requests");
    expect(operation).toHaveBeenCalledTimes(RATE_LIMIT_RETRY_DELAYS_MS.length + 1);
  });

  it("stops waiting when the import is canceled", async () => {
    let stopped = false;
    const operation = vi.fn().mockRejectedValue(rateLimited());

    await expect(withRateLimitRetry(operation, {
      wait: async () => { stopped = true; },
      shouldStop: () => stopped,
    })).rejects.toThrow("Too many requests");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
