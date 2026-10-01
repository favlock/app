import { beforeEach, describe, expect, it, vi } from "vitest";

const { postAuthenticatedJson } = vi.hoisted(() => ({
  postAuthenticatedJson: vi.fn(),
}));

vi.mock("./authenticatedApi", () => ({
  postAuthenticatedJson,
}));

import { createExtensionSessionToken } from "./firefoxExtensionSession";

describe("extension session authorization", () => {
  beforeEach(() => {
    postAuthenticatedJson.mockReset();
  });

  it("returns the one-time token for the expected authenticated user", async () => {
    postAuthenticatedJson.mockResolvedValue({
      data: { token: "one-time-token" },
    });

    await expect(
      createExtensionSessionToken({
        extensionId: "firefox@favlock.app",
        accessToken: "access-token",
      }),
    ).resolves.toBe("one-time-token");
    expect(postAuthenticatedJson).toHaveBeenCalledWith(
      "/v1/extensions/session",
      "access-token",
      { extensionId: "firefox@favlock.app" },
      "FavLock could not authorize the extension. Please try again.",
    );
  });

  it("rejects an invalid extension or malformed API token response", async () => {
    await expect(
      createExtensionSessionToken({
        extensionId: "invalid",
        accessToken: "access-token",
      }),
    ).rejects.toThrow("extension ID is invalid");

    postAuthenticatedJson.mockResolvedValue({ data: { token: null } });
    await expect(
      createExtensionSessionToken({
        extensionId: "firefox@favlock.app",
        accessToken: "access-token",
      }),
    ).rejects.toThrow("invalid extension authorization");
  });
});
