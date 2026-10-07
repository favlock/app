import { CloudAccessError } from "./cloudAccess";

// The API counts requests per client in a 60-second window and does not expose
// Retry-After to the browser, so waits step up until the window has reset.
export const RATE_LIMIT_RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 60_000, 60_000] as const;

export function isRateLimitedError(error: unknown): error is CloudAccessError {
  return error instanceof CloudAccessError && error.code === "rate_limited";
}

export async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  options: {
    onWait?: (delayMs: number) => void;
    shouldStop?: () => boolean;
    wait?: (delayMs: number) => Promise<void>;
  } = {},
): Promise<T> {
  const wait = options.wait ?? ((delayMs: number) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, delayMs)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delayMs = RATE_LIMIT_RETRY_DELAYS_MS[attempt];
      if (!isRateLimitedError(error) || delayMs === undefined || options.shouldStop?.()) {
        throw error;
      }
      options.onWait?.(delayMs);
      await wait(delayMs);
      if (options.shouldStop?.()) throw error;
    }
  }
}
