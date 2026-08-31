export const PLAN_IDS = ["free", "pro"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

/** Numeric plan allowances. Zero means unlimited for every resource. */
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
  bookmarkAccess: BookmarkAccess;
};

export type BookmarkAccessMode = "normal" | "grace" | "recovery";

export type BookmarkAccess = {
  mode: BookmarkAccessMode;
  count: number;
  limit: number;
  graceEndsAt: string | null;
  cleanupAt: string | null;
};

export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    trashRecoveryDays: 7,
    limits: {
      bookmarks: 1_000,
      entries: 50,
      readspace: 25,
      collections: 0,
      tags: 0,
      lists: 3,
    },
    bookmarkAccess: {
      mode: "normal",
      count: 0,
      limit: 1_000,
      graceEndsAt: null,
      cleanupAt: null,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    trashRecoveryDays: 30,
    limits: {
      bookmarks: 0,
      entries: 1_000,
      readspace: 250,
      collections: 0,
      tags: 0,
      lists: 0,
    },
    bookmarkAccess: {
      mode: "normal",
      count: 0,
      limit: 0,
      graceEndsAt: null,
      cleanupAt: null,
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

export function isUnlimitedResourceLimit(limit: number): boolean {
  return limit === 0;
}

export function formatResourceLimit(limit: number): string {
  return isUnlimitedResourceLimit(limit)
    ? "Unlimited"
    : limit.toLocaleString("en-US");
}

export function hasReachedResourceLimit(used: number, limit: number): boolean {
  return !isUnlimitedResourceLimit(limit) && used >= limit;
}

export function getRemainingResourceLimit(
  used: number,
  limit: number,
): number | null {
  return isUnlimitedResourceLimit(limit) ? null : Math.max(0, limit - used);
}
