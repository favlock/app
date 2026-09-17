import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkLinkHealthBatch } from "./linkHealthApi";

const postAuthenticatedJson = vi.hoisted(() => vi.fn());
vi.mock("./authenticatedApi", () => ({ postAuthenticatedJson }));

describe("checkLinkHealthBatch", () => {
  beforeEach(() => postAuthenticatedJson.mockReset());

  it("sends a bounded batch through the authenticated API", async () => {
    postAuthenticatedJson.mockResolvedValue({
      data: { results: [{ status: "broken", statusCode: 404 }] },
    });
    await expect(
      checkLinkHealthBatch("token", ["https://example.com/missing"]),
    ).resolves.toEqual([{ status: "broken", statusCode: 404 }]);
    expect(postAuthenticatedJson).toHaveBeenCalledWith(
      "/v1/library/links/check",
      "token",
      { urls: ["https://example.com/missing"] },
      "Could not check these links.",
      { signal: undefined, timeoutMs: 120_000 },
    );
  });

  it("rejects malformed or misaligned responses", async () => {
    postAuthenticatedJson.mockResolvedValue({ data: { results: [] } });
    await expect(
      checkLinkHealthBatch("token", ["https://example.com/"]),
    ).rejects.toThrow("invalid response");
  });
});
