import { beforeEach, describe, expect, it } from "vitest";
import {
  acknowledgeCloudOnboardingProgress,
  applyCloudOnboardingProgress,
  carryLocalOnboardingProgress,
  LEGACY_ONBOARDING_STORAGE_KEY,
  hasCompletedFirstValue,
  hasConfirmedProtection,
  markAccountReady,
  markFirstRetrieval,
  markProtectionConfirmed,
  markProtectionPending,
  ONBOARDING_STORAGE_KEY_PREFIX,
  readOnboardingState,
  reconcileExistingAccountOnboarding,
  saveOnboardingPreference,
  setLibraryPopulated,
} from "./onboarding";

describe("account-scoped onboarding state", () => {
  beforeEach(() => localStorage.clear());

  it("keeps an unrecognized account unknown", () => {
    const state = readOnboardingState("existing-account");
    expect(state).toEqual({
      version: 1,
      accountReadiness: "unknown",
      protection: { status: "unknown", method: null },
      libraryPopulated: "unknown",
      firstRetrieval: "unknown",
      dismissals: { welcomeTour: null },
      cloudSync: {
        hydrated: false,
        pendingCompletedSteps: [],
        pendingDismissal: null,
      },
    });
    expect(hasConfirmedProtection(state)).toBe(false);
    expect(hasCompletedFirstValue(state)).toBe(false);
  });

  it("records readiness and durable protection only at their explicit boundaries", () => {
    markAccountReady("account-a");
    markProtectionPending("account-a", "passkey");
    expect(readOnboardingState("account-a").protection).toEqual({
      status: "pending",
      method: "passkey",
    });

    markProtectionConfirmed("account-a", "passkey");
    const confirmed = readOnboardingState("account-a");
    expect(confirmed).toMatchObject({
      accountReadiness: "ready",
      protection: { status: "confirmed", method: "passkey" },
    });
    expect(hasConfirmedProtection(confirmed)).toBe(true);
  });

  it("reconciles an old protected account from durable account and library evidence", () => {
    reconcileExistingAccountOnboarding("account-a");
    setLibraryPopulated("account-a", true);

    expect(readOnboardingState("account-a")).toMatchObject({
      protection: { status: "confirmed", method: null },
      libraryPopulated: "populated",
      firstRetrieval: "unknown",
      dismissals: { welcomeTour: true },
      cloudSync: {
        pendingCompletedSteps: [
          "library_protected",
          "first_save_or_import",
        ],
        pendingDismissal: true,
      },
    });
  });

  it("does not replace an explicit protection setup with legacy reconciliation", () => {
    markProtectionPending("account-a", "passkey");
    reconcileExistingAccountOnboarding("account-a");

    expect(readOnboardingState("account-a")).toMatchObject({
      protection: { status: "pending", method: "passkey" },
      libraryPopulated: "unknown",
      cloudSync: { pendingCompletedSteps: [] },
    });
  });

  it("isolates functional flags and dismissals by account", () => {
    markProtectionConfirmed("account-a", "recovery-key");
    setLibraryPopulated("account-a", true);
    markFirstRetrieval("account-a");
    saveOnboardingPreference("account-a", true);

    expect(readOnboardingState("account-a")).toMatchObject({
      libraryPopulated: "populated",
      firstRetrieval: "completed",
      dismissals: { welcomeTour: true },
      cloudSync: {
        pendingCompletedSteps: [
          "library_protected",
          "first_save_or_import",
          "first_deliberate_retrieval",
        ],
        pendingDismissal: true,
      },
    });
    expect(readOnboardingState("account-b").protection.status).toBe("unknown");
    expect(readOnboardingState("account-b").dismissals.welcomeTour).toBeNull();
    expect(hasCompletedFirstValue(readOnboardingState("account-a"))).toBe(true);
  });

  it("preserves the legacy tour preference without inferring other milestones", () => {
    localStorage.setItem(LEGACY_ONBOARDING_STORAGE_KEY, "true");

    expect(readOnboardingState("legacy-account")).toMatchObject({
      accountReadiness: "unknown",
      protection: { status: "unknown", method: null },
      dismissals: { welcomeTour: true },
      cloudSync: { pendingDismissal: true },
    });
  });

  it("ignores malformed or unsupported records", () => {
    localStorage.setItem(
      `${ONBOARDING_STORAGE_KEY_PREFIX}account-a`,
      JSON.stringify({ version: 2, protection: { status: "confirmed" } }),
    );

    expect(readOnboardingState("account-a").protection.status).toBe("unknown");
  });

  it("hydrates an empty browser from account progress", () => {
    applyCloudOnboardingProgress("account-a", {
      version: 1,
      completedSteps: ["library_protected", "first_save_or_import"],
      dismissed: true,
    });

    expect(readOnboardingState("account-a")).toMatchObject({
      protection: { status: "confirmed", method: null },
      libraryPopulated: "populated",
      firstRetrieval: "unknown",
      dismissals: { welcomeTour: true },
      cloudSync: {
        hydrated: true,
        pendingCompletedSteps: [],
        pendingDismissal: null,
      },
    });
  });

  it("keeps unsynced local actions until the cloud acknowledges them", () => {
    markFirstRetrieval("account-a");
    saveOnboardingPreference("account-a", false);

    applyCloudOnboardingProgress("account-a", {
      version: 1,
      completedSteps: ["library_protected"],
      dismissed: true,
    });
    expect(readOnboardingState("account-a")).toMatchObject({
      firstRetrieval: "completed",
      dismissals: { welcomeTour: false },
      cloudSync: {
        pendingCompletedSteps: ["first_deliberate_retrieval"],
        pendingDismissal: false,
      },
    });

    acknowledgeCloudOnboardingProgress("account-a", {
      version: 1,
      completedSteps: ["library_protected", "first_deliberate_retrieval"],
      dismissed: false,
    });
    expect(readOnboardingState("account-a").cloudSync).toEqual({
      hydrated: true,
      pendingCompletedSteps: [],
      pendingDismissal: null,
    });
  });

  it("does not queue an empty-library observation as a completed write", () => {
    setLibraryPopulated("account-a", false);
    expect(readOnboardingState("account-a")).toMatchObject({
      libraryPopulated: "empty",
      cloudSync: { pendingCompletedSteps: [] },
    });
  });

  it("carries completed local steps into a connected cloud account", () => {
    markProtectionConfirmed("local-vault", "passkey");
    setLibraryPopulated("local-vault", true);
    markFirstRetrieval("local-vault");
    saveOnboardingPreference("local-vault", true);

    carryLocalOnboardingProgress("local-vault", "cloud-account");

    expect(readOnboardingState("cloud-account")).toMatchObject({
      accountReadiness: "ready",
      protection: { status: "confirmed", method: "recovery-key" },
      libraryPopulated: "populated",
      firstRetrieval: "completed",
      dismissals: { welcomeTour: true },
      cloudSync: {
        pendingCompletedSteps: [
          "library_protected",
          "first_save_or_import",
          "first_deliberate_retrieval",
        ],
        pendingDismissal: true,
      },
    });
  });

  it("preserves explicit destination progress while adding local milestones", () => {
    markProtectionConfirmed("local-vault", "passkey");
    setLibraryPopulated("local-vault", true);
    markProtectionConfirmed("cloud-account", "passkey");
    saveOnboardingPreference("cloud-account", false);

    carryLocalOnboardingProgress("local-vault", "cloud-account");

    expect(readOnboardingState("cloud-account")).toMatchObject({
      protection: { status: "confirmed", method: "passkey" },
      libraryPopulated: "populated",
      dismissals: { welcomeTour: false },
      cloudSync: { pendingDismissal: false },
    });
  });
});
