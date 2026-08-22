export const PLAN_IDS = ["free", "pro"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

export type ResourceLimits = {
  bookmarks: number;
  /** Notes and todos combined. */
  entries: number;
  readspace: number;
  /** Zero means unlimited. */
  collections: number;
  /** Zero means unlimited. */
  tags: number;
  /** Zero means unlimited. */
  lists: number;
};

export type PlanDefinition = {
  id: string;
  name: string;
  trashRecoveryDays: number;
  limits: ResourceLimits;
};

export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    trashRecoveryDays: 7,
    limits: {
      bookmarks: 500,
      entries: 50,
      readspace: 25,
      collections: 0,
      tags: 0,
      lists: 3,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    trashRecoveryDays: 30,
    limits: {
      bookmarks: 10_000,
      entries: 1_000,
      readspace: 250,
      collections: 0,
      tags: 0,
      lists: 0,
    },
  },
} as const satisfies Record<PlanId, PlanDefinition>;

export const DEFAULT_PLAN_ID: PlanId = "free";
export const DEFAULT_PLAN = PLANS[DEFAULT_PLAN_ID];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && PLAN_IDS.includes(value as PlanId);
}

export function getPlan(value: unknown): PlanDefinition {
  return isPlanId(value) ? PLANS[value] : DEFAULT_PLAN;
}
