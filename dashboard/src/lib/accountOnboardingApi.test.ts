import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAccountOnboardingProgress,
  parseAccountOnboardingProgress,
  updateAccountOnboardingProgress,
} from "./accountOnboardingApi";

const mocks = vi.hoisted(() => ({
  fetchAuthenticatedJson: vi.fn(),
  patchAuthenticatedJson: vi.fn(),
}));

vi.mock("./authenticatedApi", () => mocks);

const response = {
  data: {
    version: 1,
    completedSteps: ["library_protected"],
    dismissed: false,
  },
};

describe("account onboarding API", () => {
  beforeEach(() => {
    mocks.fetchAuthenticatedJson.mockReset();
    mocks.patchAuthenticatedJson.mockReset();
  });

  it("parses the bounded versioned response", () => {
    expect(parseAccountOnboardingProgress(response)).toEqual(response.data);
  });

  it.each([
    null,
    {},
    { data: { ...response.data, version: 2 } },
    { data: { ...response.data, completedSteps: ["unknown"] } },
    { data: { ...response.data, completedSteps: ["library_protected", "library_protected"] } },
    { data: { ...response.data, dismissed: "false" } },
  ])("rejects incompatible progress %#", (value) => {
    expect(() => parseAccountOnboardingProgress(value)).toThrow(
      "We could not load your getting started progress.",
    );
  });

  it("loads progress through the authenticated account route", async () => {
    mocks.fetchAuthenticatedJson.mockResolvedValue(response);
    await expect(fetchAccountOnboardingProgress("token")).resolves.toEqual(
      response.data,
    );
    expect(mocks.fetchAuthenticatedJson).toHaveBeenCalledWith(
      "/v1/account/onboarding",
      "token",
      "We could not load your getting started progress.",
    );
  });

  it("writes only the requested functional transition", async () => {
    mocks.patchAuthenticatedJson.mockResolvedValue(response);
    await updateAccountOnboardingProgress("token", {
      version: 1,
      completedSteps: ["library_protected"],
      dismissed: false,
    });
    expect(mocks.patchAuthenticatedJson).toHaveBeenCalledWith(
      "/v1/account/onboarding",
      "token",
      {
        version: 1,
        completedSteps: ["library_protected"],
        dismissed: false,
      },
      "We could not sync your getting started progress.",
    );
  });
});
