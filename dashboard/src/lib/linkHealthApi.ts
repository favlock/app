import { postAuthenticatedJson } from "./authenticatedApi";

export type LinkHealthStatus =
  | "working"
  | "redirected"
  | "broken"
  | "restricted"
  | "unverified";

export interface LinkHealthCheckResult {
  status: LinkHealthStatus;
  statusCode?: number;
}

function isResult(value: unknown): value is LinkHealthCheckResult {
  if (!value || typeof value !== "object" || !("status" in value)) return false;
  const status = value.status;
  if (
    status !== "working" &&
    status !== "redirected" &&
    status !== "broken" &&
    status !== "restricted" &&
    status !== "unverified"
  ) {
    return false;
  }
  if (!("statusCode" in value) || value.statusCode === undefined) return true;
  return (
    Number.isInteger(value.statusCode) &&
    Number(value.statusCode) >= 100 &&
    Number(value.statusCode) <= 599
  );
}

export async function checkLinkHealthBatch(
  accessToken: string,
  urls: string[],
  signal?: AbortSignal,
): Promise<LinkHealthCheckResult[]> {
  const payload = await postAuthenticatedJson(
    "/v1/library/links/check",
    accessToken,
    { urls },
    "Could not check these links.",
    { signal, timeoutMs: 120_000 },
  );
  const data = payload && typeof payload === "object" && "data" in payload
    ? payload.data
    : null;
  const results = data && typeof data === "object" && "results" in data
    ? data.results
    : null;
  if (
    !Array.isArray(results) ||
    results.length !== urls.length ||
    !results.every(isResult)
  ) {
    throw new Error("The link check returned an invalid response.");
  }
  return results;
}
