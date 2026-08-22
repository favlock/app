import type { PlanDefinition } from "@favlock/shared";
import { fetchAuthenticatedJson } from "./authenticatedApi";

const ACCOUNT_PLAN_ERROR =
  "We could not load your account plan. Please try again.";

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function parseAccountPlan(value: unknown): PlanDefinition {
  if (!value || typeof value !== "object") throw new Error(ACCOUNT_PLAN_ERROR);
  const response = value as Record<string, unknown>;
  const data = response.data;
  if (!data || typeof data !== "object") throw new Error(ACCOUNT_PLAN_ERROR);

  const plan = data as Record<string, unknown>;
  const limitsValue = plan.limits;
  if (!limitsValue || typeof limitsValue !== "object") {
    throw new Error(ACCOUNT_PLAN_ERROR);
  }
  const limits = limitsValue as Record<string, unknown>;

  if (
    typeof plan.id !== "string" ||
    !plan.id ||
    typeof plan.name !== "string" ||
    !plan.name ||
    !isNonNegativeInteger(plan.trashRecoveryDays) ||
    !isNonNegativeInteger(limits.bookmarks) ||
    !isNonNegativeInteger(limits.entries) ||
    !isNonNegativeInteger(limits.readspace) ||
    !isNonNegativeInteger(limits.collections) ||
    !isNonNegativeInteger(limits.tags) ||
    !isNonNegativeInteger(limits.lists)
  ) {
    throw new Error(ACCOUNT_PLAN_ERROR);
  }

  return {
    id: plan.id,
    name: plan.name,
    trashRecoveryDays: plan.trashRecoveryDays,
    limits: {
      bookmarks: limits.bookmarks,
      entries: limits.entries,
      readspace: limits.readspace,
      collections: limits.collections,
      tags: limits.tags,
      lists: limits.lists,
    },
  };
}

export async function fetchAccountPlan(
  accessToken: string,
): Promise<PlanDefinition> {
  const payload = await fetchAuthenticatedJson(
    "/v1/account/plan",
    accessToken,
    ACCOUNT_PLAN_ERROR,
  );
  return parseAccountPlan(payload);
}
