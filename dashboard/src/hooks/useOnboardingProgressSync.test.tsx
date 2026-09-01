import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  markProtectionConfirmed,
  readOnboardingState,
  saveOnboardingPreference,
} from "../lib/onboarding";
import { useOnboardingProgressSync } from "./useOnboardingProgressSync";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  auth: {
    cloudStatus: "available",
    session: { access_token: "access-token" },
    user: { id: "account-a" },
  } as {
    cloudStatus: "available" | "offline";
    session: { access_token: string } | null;
    user: { id: string } | null;
  },
  fetchProgress: vi.fn(),
  updateProgress: vi.fn(),
}));

vi.mock("../context/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("../lib/accountOnboardingApi", () => ({
  fetchAccountOnboardingProgress: mocks.fetchProgress,
  updateAccountOnboardingProgress: mocks.updateProgress,
}));

function Harness() {
  const { ready } = useOnboardingProgressSync();
  return <span>{ready ? "ready" : "loading"}</span>;
}

describe("useOnboardingProgressSync", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    localStorage.clear();
    mocks.auth = {
      cloudStatus: "available",
      session: { access_token: "access-token" },
      user: { id: "account-a" },
    };
    mocks.fetchProgress.mockReset();
    mocks.updateProgress.mockReset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });

  async function render() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>,
      );
    });
  }

  it("hydrates another browser from the account's cloud progress", async () => {
    mocks.fetchProgress.mockResolvedValue({
      version: 1,
      completedSteps: [
        "library_protected",
        "first_save_or_import",
        "first_deliberate_retrieval",
      ],
      dismissed: true,
    });
    await render();

    await vi.waitFor(() => {
      expect(container.textContent).toBe("ready");
      expect(readOnboardingState("account-a")).toMatchObject({
        protection: { status: "confirmed" },
        libraryPopulated: "populated",
        firstRetrieval: "completed",
        dismissals: { welcomeTour: true },
      });
    });
    expect(mocks.updateProgress).not.toHaveBeenCalled();
  });

  it("merges and acknowledges a local successful action", async () => {
    markProtectionConfirmed("account-a", "passkey");
    mocks.fetchProgress.mockResolvedValue({
      version: 1,
      completedSteps: [],
      dismissed: false,
    });
    mocks.updateProgress.mockResolvedValue({
      version: 1,
      completedSteps: ["library_protected"],
      dismissed: false,
    });
    await render();

    await vi.waitFor(() =>
      expect(mocks.updateProgress).toHaveBeenCalledWith("access-token", {
        version: 1,
        completedSteps: ["library_protected"],
      }),
    );
    await vi.waitFor(() =>
      expect(readOnboardingState("account-a").cloudSync.pendingCompletedSteps)
        .toEqual([]),
    );
  });

  it("syncs an explicit reopen independently of completion", async () => {
    saveOnboardingPreference("account-a", false);
    mocks.fetchProgress.mockResolvedValue({
      version: 1,
      completedSteps: ["library_protected"],
      dismissed: true,
    });
    mocks.updateProgress.mockResolvedValue({
      version: 1,
      completedSteps: ["library_protected"],
      dismissed: false,
    });
    await render();

    await vi.waitFor(() =>
      expect(mocks.updateProgress).toHaveBeenCalledWith("access-token", {
        version: 1,
        dismissed: false,
      }),
    );
    await vi.waitFor(() =>
      expect(readOnboardingState("account-a").cloudSync.pendingDismissal)
        .toBeNull(),
    );
  });

  it("uses local state immediately while offline without attempting cloud writes", async () => {
    mocks.auth.cloudStatus = "offline";
    markProtectionConfirmed("account-a", "recovery-key");
    await render();

    expect(container.textContent).toBe("ready");
    expect(readOnboardingState("account-a").protection.status).toBe("confirmed");
    expect(mocks.fetchProgress).not.toHaveBeenCalled();
    expect(mocks.updateProgress).not.toHaveBeenCalled();
  });
});
