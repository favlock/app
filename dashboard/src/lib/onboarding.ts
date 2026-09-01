export const ONBOARDING_STATE_VERSION = 1 as const;
export const LEGACY_ONBOARDING_STORAGE_KEY = "favlock:onboarding:hidden:v1";
export const ONBOARDING_STORAGE_KEY_PREFIX = "favlock:onboarding:state:v1:";
export const ONBOARDING_STATE_CHANGED_EVENT =
  "favlock:onboarding-state-changed";

export const ONBOARDING_CLOUD_STEPS = [
  "library_protected",
  "first_save_or_import",
  "first_deliberate_retrieval",
] as const;

export type OnboardingCloudStep = (typeof ONBOARDING_CLOUD_STEPS)[number];

export type ProtectionMethod = "passkey" | "recovery-key";

/**
 * Minimal functional contract shared by onboarding steps. The same account's
 * cloud progress is authoritative when available; this record remains the
 * local/offline projection and pending-write journal, never analytics.
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
  cloudSync: {
    hydrated: boolean;
    pendingCompletedSteps: OnboardingCloudStep[];
    pendingDismissal: boolean | null;
  };
}

export interface CloudOnboardingProgress {
  version: typeof ONBOARDING_STATE_VERSION;
  completedSteps: OnboardingCloudStep[];
  dismissed: boolean;
}

const defaultState = (): OnboardingStateV1 => ({
  version: ONBOARDING_STATE_VERSION,
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

const storageKey = (userId: string) =>
  `${ONBOARDING_STORAGE_KEY_PREFIX}${userId}`;

function parseState(value: string | null): OnboardingStateV1 | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<OnboardingStateV1>;
    const protectionMethod = parsed.protection?.method;
    const welcomeTourDismissal = parsed.dismissals?.welcomeTour;
    const hasCloudSync = parsed.cloudSync !== undefined;
    const storedPendingSteps = parsed.cloudSync?.pendingCompletedSteps;
    const storedPendingDismissal = parsed.cloudSync?.pendingDismissal;
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
      ![null, true, false].includes(welcomeTourDismissal as boolean | null) ||
      (storedPendingSteps !== undefined &&
        (!Array.isArray(storedPendingSteps) ||
          !storedPendingSteps.every(isOnboardingCloudStep))) ||
      (storedPendingDismissal !== undefined &&
        ![null, true, false].includes(
          storedPendingDismissal as boolean | null,
        )) ||
      (parsed.cloudSync?.hydrated !== undefined &&
        typeof parsed.cloudSync.hydrated !== "boolean")
    ) {
      return null;
    }

    const legacyPendingSteps: OnboardingCloudStep[] = [];
    if (parsed.protection?.status === "confirmed") {
      legacyPendingSteps.push("library_protected");
    }
    if (parsed.libraryPopulated === "populated") {
      legacyPendingSteps.push("first_save_or_import");
    }
    if (parsed.firstRetrieval === "completed") {
      legacyPendingSteps.push("first_deliberate_retrieval");
    }

    return {
      ...(parsed as Omit<OnboardingStateV1, "cloudSync">),
      cloudSync: {
        hydrated: parsed.cloudSync?.hydrated ?? false,
        pendingCompletedSteps:
          storedPendingSteps ?? (hasCloudSync ? [] : legacyPendingSteps),
        pendingDismissal:
          hasCloudSync
            ? (storedPendingDismissal ?? null)
            : (welcomeTourDismissal ?? null),
      },
    };
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
        cloudSync: { ...fallback.cloudSync, pendingDismissal: true },
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

function isOnboardingCloudStep(value: unknown): value is OnboardingCloudStep {
  return ONBOARDING_CLOUD_STEPS.includes(value as OnboardingCloudStep);
}

function addPendingStep(
  current: OnboardingStateV1,
  step: OnboardingCloudStep,
): OnboardingStateV1["cloudSync"] {
  return {
    ...current.cloudSync,
    pendingCompletedSteps: Array.from(
      new Set([...current.cloudSync.pendingCompletedSteps, step]),
    ),
  };
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
    cloudSync: addPendingStep(current, "library_protected"),
  }));
}

export function reconcileExistingAccountOnboarding(userId: string) {
  return saveOnboardingState(userId, (current) => {
    if (current.protection.status !== "unknown") return current;

    return {
      ...current,
      protection: { status: "confirmed", method: null },
      dismissals: {
        ...current.dismissals,
        welcomeTour: current.dismissals.welcomeTour ?? true,
      },
      cloudSync: {
        ...current.cloudSync,
        pendingCompletedSteps: Array.from(
          new Set([
            ...current.cloudSync.pendingCompletedSteps,
            "library_protected" as const,
          ]),
        ),
        pendingDismissal: current.cloudSync.pendingDismissal ?? true,
      },
    };
  });
}

export function hasConfirmedProtection(state: OnboardingStateV1) {
  return state.protection.status === "confirmed";
}

export function hasCompletedFirstValue(state: OnboardingStateV1) {
  return (
    hasConfirmedProtection(state) &&
    state.libraryPopulated === "populated" &&
    state.firstRetrieval === "completed"
  );
}

export function setLibraryPopulated(userId: string, populated: boolean) {
  return saveOnboardingState(userId, (current) => ({
    ...current,
    libraryPopulated: populated ? "populated" : "empty",
    cloudSync: populated
      ? addPendingStep(current, "first_save_or_import")
      : current.cloudSync,
  }));
}

export function markFirstRetrieval(userId: string) {
  return saveOnboardingState(userId, (current) => ({
    ...current,
    firstRetrieval: "completed",
    cloudSync: addPendingStep(current, "first_deliberate_retrieval"),
  }));
}

export function isOnboardingHidden(userId: string) {
  return readOnboardingState(userId).dismissals.welcomeTour === true;
}

export function saveOnboardingPreference(userId: string, hidden: boolean) {
  return saveOnboardingState(userId, (current) => ({
    ...current,
    dismissals: { ...current.dismissals, welcomeTour: hidden },
    cloudSync: { ...current.cloudSync, pendingDismissal: hidden },
  }));
}

function stateWithCompletedSteps(
  current: OnboardingStateV1,
  completedSteps: readonly OnboardingCloudStep[],
): OnboardingStateV1 {
  const completed = new Set(completedSteps);
  return {
    ...current,
    protection: completed.has("library_protected")
      ? {
          status: "confirmed",
          method: current.protection.method,
        }
      : current.protection,
    libraryPopulated: completed.has("first_save_or_import")
      ? "populated"
      : current.libraryPopulated,
    firstRetrieval: completed.has("first_deliberate_retrieval")
      ? "completed"
      : current.firstRetrieval,
  };
}

export function applyCloudOnboardingProgress(
  userId: string,
  progress: CloudOnboardingProgress,
) {
  return saveOnboardingState(userId, (current) => {
    const completedSteps = Array.from(
      new Set([
        ...progress.completedSteps,
        ...current.cloudSync.pendingCompletedSteps,
      ]),
    );
    const merged = stateWithCompletedSteps(current, completedSteps);
    return {
      ...merged,
      dismissals: {
        ...merged.dismissals,
        welcomeTour:
          current.cloudSync.pendingDismissal ?? progress.dismissed,
      },
      cloudSync: { ...current.cloudSync, hydrated: true },
    };
  });
}

export function acknowledgeCloudOnboardingProgress(
  userId: string,
  progress: CloudOnboardingProgress,
) {
  return saveOnboardingState(userId, (current) => {
    const confirmed = new Set(progress.completedSteps);
    const merged = stateWithCompletedSteps(current, progress.completedSteps);
    return {
      ...merged,
      dismissals: {
        ...merged.dismissals,
        welcomeTour: progress.dismissed,
      },
      cloudSync: {
        hydrated: true,
        pendingCompletedSteps: current.cloudSync.pendingCompletedSteps.filter(
          (step) => !confirmed.has(step),
        ),
        pendingDismissal:
          current.cloudSync.pendingDismissal === progress.dismissed
            ? null
            : current.cloudSync.pendingDismissal,
      },
    };
  });
}
