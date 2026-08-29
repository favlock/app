export const ONBOARDING_STATE_VERSION = 1 as const;
export const LEGACY_ONBOARDING_STORAGE_KEY = "favlock:onboarding:hidden:v1";
export const ONBOARDING_STORAGE_KEY_PREFIX = "favlock:onboarding:state:v1:";
export const ONBOARDING_STATE_CHANGED_EVENT =
  "favlock:onboarding-state-changed";

export type ProtectionMethod = "passkey" | "recovery-key";

/**
 * Minimal functional contract shared by onboarding steps. Records are scoped
 * to one account in this browser only: they are not telemetry, do not sync,
 * and must stay `unknown` when this device has no trustworthy evidence.
 */
export interface OnboardingStateV1 {
  version: typeof ONBOARDING_STATE_VERSION;
  accountReadiness: "unknown" | "ready";
  protection: {
    status: "unknown" | "pending" | "confirmed";
    method: ProtectionMethod | null;
  };
  libraryPopulated: "unknown" | "empty" | "populated";
  firstRetrieval: "unknown" | "completed";
  dismissals: {
    welcomeTour: boolean | null;
  };
}

const defaultState = (): OnboardingStateV1 => ({
  version: ONBOARDING_STATE_VERSION,
  accountReadiness: "unknown",
  protection: { status: "unknown", method: null },
  libraryPopulated: "unknown",
  firstRetrieval: "unknown",
  dismissals: { welcomeTour: null },
});

const storageKey = (userId: string) =>
  `${ONBOARDING_STORAGE_KEY_PREFIX}${userId}`;

function parseState(value: string | null): OnboardingStateV1 | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<OnboardingStateV1>;
    const protectionMethod = parsed.protection?.method;
    const welcomeTourDismissal = parsed.dismissals?.welcomeTour;
    if (
      parsed.version !== ONBOARDING_STATE_VERSION ||
      !["unknown", "ready"].includes(parsed.accountReadiness ?? "") ||
      !["unknown", "pending", "confirmed"].includes(
        parsed.protection?.status ?? "",
      ) ||
      ![null, "passkey", "recovery-key"].includes(
        protectionMethod as ProtectionMethod | null,
      ) ||
      !["unknown", "empty", "populated"].includes(
        parsed.libraryPopulated ?? "",
      ) ||
      !["unknown", "completed"].includes(parsed.firstRetrieval ?? "") ||
      ![null, true, false].includes(welcomeTourDismissal as boolean | null)
    ) {
      return null;
    }

    return parsed as OnboardingStateV1;
  } catch {
    return null;
  }
}

export function readOnboardingState(userId: string): OnboardingStateV1 {
  const fallback = defaultState();
  if (!userId) return fallback;

  try {
    const stored = parseState(window.localStorage.getItem(storageKey(userId)));
    if (stored) return stored;

    // Preserve the established device preference without turning an unknown
    // account into a known-new onboarding flow.
    if (
      window.localStorage.getItem(LEGACY_ONBOARDING_STORAGE_KEY) === "true"
    ) {
      return {
        ...fallback,
        dismissals: { welcomeTour: true },
      };
    }
  } catch {
    // Functional onboarding remains usable when device storage is unavailable.
  }

  return fallback;
}

export function saveOnboardingState(
  userId: string,
  update: (current: OnboardingStateV1) => OnboardingStateV1,
): OnboardingStateV1 {
  const current = readOnboardingState(userId);
  const next = update(current);

  if (!userId) return next;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // The flow must never depend on optional device-local progress storage.
  }
  window.dispatchEvent(
    new CustomEvent(ONBOARDING_STATE_CHANGED_EVENT, {
      detail: { userId },
    }),
  );
  return next;
}

export function markAccountReady(userId: string) {
  return saveOnboardingState(userId, (current) => ({
    ...current,
    accountReadiness: "ready",
  }));
}

export function markProtectionPending(
  userId: string,
  method: ProtectionMethod | null = null,
) {
  return saveOnboardingState(userId, (current) => ({
    ...current,
    protection: { status: "pending", method },
  }));
}

export function markProtectionConfirmed(
  userId: string,
  method: ProtectionMethod,
) {
  return saveOnboardingState(userId, (current) => ({
    ...current,
    protection: { status: "confirmed", method },
  }));
}

export function hasConfirmedProtection(state: OnboardingStateV1) {
  return state.protection.status === "confirmed";
}

export function setLibraryPopulated(userId: string, populated: boolean) {
  return saveOnboardingState(userId, (current) => ({
    ...current,
    libraryPopulated: populated ? "populated" : "empty",
  }));
}

export function markFirstRetrieval(userId: string) {
  return saveOnboardingState(userId, (current) => ({
    ...current,
    firstRetrieval: "completed",
  }));
}

export function isOnboardingHidden(userId: string) {
  return readOnboardingState(userId).dismissals.welcomeTour === true;
}

export function saveOnboardingPreference(userId: string, hidden: boolean) {
  return saveOnboardingState(userId, (current) => ({
    ...current,
    dismissals: { ...current.dismissals, welcomeTour: hidden },
  }));
}
