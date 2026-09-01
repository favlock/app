import { fetchAuthenticatedJson, patchAuthenticatedJson } from "./authenticatedApi";
import {
  ONBOARDING_CLOUD_STEPS,
  ONBOARDING_STATE_VERSION,
  type CloudOnboardingProgress,
  type OnboardingCloudStep,
} from "./onboarding";

const LOAD_ERROR = "We could not load your getting started progress.";
const SAVE_ERROR = "We could not sync your getting started progress.";

export interface AccountOnboardingPatch {
  version: typeof ONBOARDING_STATE_VERSION;
  completedSteps?: OnboardingCloudStep[];
  dismissed?: boolean;
}

function isOnboardingStep(value: unknown): value is OnboardingCloudStep {
  return ONBOARDING_CLOUD_STEPS.includes(value as OnboardingCloudStep);
}

export function parseAccountOnboardingProgress(
  value: unknown,
  failureMessage = LOAD_ERROR,
): CloudOnboardingProgress {
  if (!value || typeof value !== "object") throw new Error(failureMessage);
  const response = value as Record<string, unknown>;
  if (!response.data || typeof response.data !== "object") {
    throw new Error(failureMessage);
  }
  const progress = response.data as Record<string, unknown>;
  if (
    progress.version !== ONBOARDING_STATE_VERSION ||
    !Array.isArray(progress.completedSteps) ||
    progress.completedSteps.length > ONBOARDING_CLOUD_STEPS.length ||
    !progress.completedSteps.every(isOnboardingStep) ||
    new Set(progress.completedSteps).size !== progress.completedSteps.length ||
    typeof progress.dismissed !== "boolean"
  ) {
    throw new Error(failureMessage);
  }

  return {
    version: ONBOARDING_STATE_VERSION,
    completedSteps: progress.completedSteps,
    dismissed: progress.dismissed,
  };
}

export async function fetchAccountOnboardingProgress(
  accessToken: string,
): Promise<CloudOnboardingProgress> {
  const payload = await fetchAuthenticatedJson(
    "/v1/account/onboarding",
    accessToken,
    LOAD_ERROR,
  );
  return parseAccountOnboardingProgress(payload);
}

export async function updateAccountOnboardingProgress(
  accessToken: string,
  patch: AccountOnboardingPatch,
): Promise<CloudOnboardingProgress> {
  const payload = await patchAuthenticatedJson(
    "/v1/account/onboarding",
    accessToken,
    patch,
    SAVE_ERROR,
  );
  return parseAccountOnboardingProgress(payload, SAVE_ERROR);
}
