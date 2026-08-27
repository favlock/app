import { API_URL } from "./appUrls";
import { CloudAccessError, cloudStatusMessage, reportCloudFailure } from "./cloudAccess";

async function requestAuthenticated(
  path: `/v1/${string}`,
  accessToken: string,
  failureMessage: string,
  options: {
    method: "GET" | "PATCH" | "PUT" | "POST" | "DELETE";
    body?: object;
  },
): Promise<Response> {
  if (!accessToken) {
    throw new CloudAccessError("reconnect_required", cloudStatusMessage("reconnect_required"));
  }
  if (!navigator.onLine) throw new CloudAccessError("unavailable", cloudStatusMessage("offline"));

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    reportCloudFailure(accessToken, "unavailable");
    throw new CloudAccessError("unavailable", failureMessage);
  }

  if (!response.ok) {
    if (response.status === 401) {
      reportCloudFailure(accessToken, "reconnect_required");
      throw new CloudAccessError("reconnect_required", cloudStatusMessage("reconnect_required"));
    }
    if (response.status === 403) {
      reportCloudFailure(accessToken, "restricted");
      throw new CloudAccessError("restricted", cloudStatusMessage("restricted"));
    }
    if (response.status === 400) {
      const payload: unknown = await response.json().catch(() => null);
      const error = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
      if (error && typeof error === "object" && "code" in error && error.code === "quota_exceeded" && "details" in error) {
        const details = error.details;
        if (details && typeof details === "object" && "resource" in details && "limit" in details &&
          typeof details.resource === "string" && ["bookmarks", "entries", "readspace", "collections", "tags", "lists"].includes(details.resource) &&
          typeof details.limit === "number" && Number.isSafeInteger(details.limit) && details.limit >= 0 && details.limit <= 2147483647) {
          throw new CloudAccessError("quota_exceeded", `Your plan allows up to ${details.limit} ${details.resource}. Your existing data remains available.`, { resource: details.resource, limit: details.limit });
        }
      }
    }
    if (response.status >= 500) reportCloudFailure(accessToken, "unavailable");
    throw new Error(failureMessage);
  }

  return response;
}

async function requestAuthenticatedJson(
  path: `/v1/${string}`,
  accessToken: string,
  failureMessage: string,
  options: { method: "GET" | "PATCH" | "POST"; body?: object },
): Promise<unknown> {
  const response = await requestAuthenticated(
    path,
    accessToken,
    failureMessage,
    options,
  );
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error(failureMessage);
  }
}

export function fetchAuthenticatedJson(
  path: `/v1/${string}`,
  accessToken: string,
  failureMessage: string,
): Promise<unknown> {
  return requestAuthenticatedJson(path, accessToken, failureMessage, {
    method: "GET",
  });
}

export function patchAuthenticatedJson(
  path: `/v1/${string}`,
  accessToken: string,
  body: object,
  failureMessage: string,
): Promise<unknown> {
  return requestAuthenticatedJson(path, accessToken, failureMessage, {
    method: "PATCH",
    body,
  });
}

export function postAuthenticatedJsonWithoutBody(
  path: `/v1/${string}`,
  accessToken: string,
  failureMessage: string,
): Promise<unknown> {
  return requestAuthenticatedJson(path, accessToken, failureMessage, {
    method: "POST",
  });
}

export function postAuthenticatedJson(
  path: `/v1/${string}`,
  accessToken: string,
  body: object,
  failureMessage: string,
): Promise<unknown> {
  return requestAuthenticatedJson(path, accessToken, failureMessage, {
    method: "POST",
    body,
  });
}

export async function putAuthenticatedJsonWithoutResponse(
  path: `/v1/${string}`,
  accessToken: string,
  body: object,
  failureMessage: string,
): Promise<void> {
  const response = await requestAuthenticated(
    path,
    accessToken,
    failureMessage,
    { method: "PUT", body },
  );
  if (response.status !== 204) throw new Error(failureMessage);
}

export async function postAuthenticatedJsonWithoutResponse(
  path: `/v1/${string}`,
  accessToken: string,
  body: object,
  failureMessage: string,
): Promise<void> {
  const response = await requestAuthenticated(
    path,
    accessToken,
    failureMessage,
    { method: "POST", body },
  );
  if (response.status !== 204) throw new Error(failureMessage);
}

export async function patchAuthenticatedJsonWithoutResponse(
  path: `/v1/${string}`,
  accessToken: string,
  body: object,
  failureMessage: string,
): Promise<void> {
  const response = await requestAuthenticated(
    path,
    accessToken,
    failureMessage,
    { method: "PATCH", body },
  );
  if (response.status !== 204) throw new Error(failureMessage);
}

export async function deleteAuthenticatedWithoutResponse(
  path: `/v1/${string}`,
  accessToken: string,
  failureMessage: string,
): Promise<void> {
  const response = await requestAuthenticated(
    path,
    accessToken,
    failureMessage,
    { method: "DELETE" },
  );
  if (response.status !== 204) throw new Error(failureMessage);
}
