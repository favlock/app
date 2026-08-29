import { beforeEach, describe, expect, it } from "vitest";
import {
  LEGACY_ONBOARDING_STORAGE_KEY,
  hasConfirmedProtection,
  markAccountReady,
  markFirstRetrieval,
  markProtectionConfirmed,
  markProtectionPending,
  ONBOARDING_STORAGE_KEY_PREFIX,
  readOnboardingState,
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
    });
    expect(hasConfirmedProtection(state)).toBe(false);
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

  it("isolates functional flags and dismissals by account", () => {
    markProtectionConfirmed("account-a", "recovery-key");
    setLibraryPopulated("account-a", true);
    markFirstRetrieval("account-a");
    saveOnboardingPreference("account-a", true);

    expect(readOnboardingState("account-a")).toMatchObject({
      libraryPopulated: "populated",
      firstRetrieval: "completed",
      dismissals: { welcomeTour: true },
    });
    expect(readOnboardingState("account-b").protection.status).toBe("unknown");
    expect(readOnboardingState("account-b").dismissals.welcomeTour).toBeNull();
  });

  it("preserves the legacy tour preference without inferring other milestones", () => {
    localStorage.setItem(LEGACY_ONBOARDING_STORAGE_KEY, "true");

    expect(readOnboardingState("legacy-account")).toMatchObject({
      accountReadiness: "unknown",
      protection: { status: "unknown", method: null },
      dismissals: { welcomeTour: true },
    });
  });

  it("ignores malformed or unsupported records", () => {
    localStorage.setItem(
      `${ONBOARDING_STORAGE_KEY_PREFIX}account-a`,
      JSON.stringify({ version: 2, protection: { status: "confirmed" } }),
    );

    expect(readOnboardingState("account-a").protection.status).toBe("unknown");
  });
});
