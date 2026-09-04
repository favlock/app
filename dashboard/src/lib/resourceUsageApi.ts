import { fetchAuthenticatedJson } from "./authenticatedApi";

const RESOURCE_USAGE_ERROR =
  "We could not load your resource usage. Please try again.";

export interface ResourceUsage {
  bookmarks: number;
  entries: number;
  readspace: number;
  highlights: number;
  collections: number;
  tags: number;
  lists: number;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function parseResourceUsage(value: unknown): ResourceUsage {
  if (!value || typeof value !== "object") {
    throw new Error(RESOURCE_USAGE_ERROR);
  }
  const response = value as Record<string, unknown>;
  if (!response.data || typeof response.data !== "object") {
    throw new Error(RESOURCE_USAGE_ERROR);
  }
  const usage = response.data as Record<string, unknown>;

  if (
    !isNonNegativeInteger(usage.bookmarks) ||
    !isNonNegativeInteger(usage.entries) ||
    !isNonNegativeInteger(usage.readspace) ||
    !isNonNegativeInteger(usage.highlights) ||
    !isNonNegativeInteger(usage.collections) ||
    !isNonNegativeInteger(usage.tags) ||
    !isNonNegativeInteger(usage.lists)
  ) {
    throw new Error(RESOURCE_USAGE_ERROR);
  }

  return {
    bookmarks: usage.bookmarks,
    entries: usage.entries,
    readspace: usage.readspace,
    highlights: usage.highlights,
    collections: usage.collections,
    tags: usage.tags,
    lists: usage.lists,
  };
}

export async function fetchResourceUsage(
  accessToken: string,
): Promise<ResourceUsage> {
  const payload = await fetchAuthenticatedJson(
    "/v1/account/usage",
    accessToken,
    RESOURCE_USAGE_ERROR,
  );
  return parseResourceUsage(payload);
}
