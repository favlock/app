import { API_URL } from "./appUrls";
import { CloudAccessError, cloudStatusMessage, reportCloudFailure } from "./cloudAccess";
import { favLockAuth, type AuthRequestSession } from "./favLockAuth";

interface AuthenticatedResponse {
  response: Response;
  session: AuthRequestSession;
}

function assertCurrentRequest(session: AuthRequestSession): void {
  if (!favLockAuth.isRequestSessionCurrent(session)) {
    const error = favLockAuth.getConnectionError();
    if (error instanceof CloudAccessError && error.code === "unavailable") throw error;
    throw new Error("The account changed. Please try again.");
  }
}

async function requestAuthenticated(
  path: `/v1/${string}`,
  accessToken: string,
  failureMessage: string,
  options: {
    method: "GET" | "PATCH" | "PUT" | "POST" | "DELETE";
    body?: object;
  },
): Promise<AuthenticatedResponse> {
  if (!accessToken) {
    throw new CloudAccessError("reconnect_required", cloudStatusMessage("reconnect_required"));
  }
  if (!navigator.onLine) throw new CloudAccessError("unavailable", cloudStatusMessage("offline"));

  const body = options.body ? JSON.stringify(options.body) : undefined;
  let session = await favLockAuth.getRequestSession(accessToken);

  async function send(requestSession: AuthRequestSession): Promise<Response> {
    // A sign-out or new sign-in can happen while token refresh is awaiting I/O.
    assertCurrentRequest(requestSession);
    let response: Response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        method: options.method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${requestSession.accessToken}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body } : {}),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      assertCurrentRequest(requestSession);
      reportCloudFailure(requestSession.accessToken, "unavailable");
      throw new CloudAccessError("unavailable", failureMessage);
    }
    assertCurrentRequest(requestSession);
    return response;
  }

  let response = await send(session);
  assertCurrentRequest(session);
  if (response.status === 401) {
    // Only an explicit authentication rejection permits replay. A timeout or
    // server failure may have happened after a mutation already committed.
    const refreshed = await favLockAuth.refreshRequestSession(session);
    assertCurrentRequest(session);
    if (refreshed.userId !== session.userId || refreshed.generation !== session.generation) {
      throw new Error("The account changed. Please try again.");
    }
    session = refreshed;
    response = await send(session);
  }
  assertCurrentRequest(session);

  if (!response.ok) {
    if (response.status === 401) {
      reportCloudFailure(session.accessToken, "reconnect_required");
      throw new CloudAccessError("reconnect_required", cloudStatusMessage("reconnect_required"));
    }
    if (response.status === 403) {
      const payload: unknown = typeof response.clone === "function"
        ? await response.clone().json().catch(() => null)
        : null;
      const error = payload && typeof payload === "object" && "error" in payload
        ? payload.error
        : null;
      if (error && typeof error === "object" && "code" in error && error.code === "pro_required") {
        throw new Error("Annotations require FavLock Pro.");
      }
      reportCloudFailure(session.accessToken, "restricted");
      throw new CloudAccessError("restricted", cloudStatusMessage("restricted"));
    }
    if (response.status === 400) {
      const payload: unknown = await response.json().catch(() => null);
      assertCurrentRequest(session);
      const error = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
      if (error && typeof error === "object" && "code" in error && error.code === "quota_exceeded" && "details" in error) {
        const details = error.details;
        if (details && typeof details === "object" && "resource" in details && "limit" in details &&
          typeof details.resource === "string" && ["bookmarks", "entries", "readspace", "highlights", "collections", "tags", "lists"].includes(details.resource) &&
          typeof details.limit === "number" && Number.isSafeInteger(details.limit) && details.limit >= 0 && details.limit <= 2147483647) {
          throw new CloudAccessError("quota_exceeded", `Your plan allows up to ${details.limit} ${details.resource}. Your existing data remains available.`, { resource: details.resource, limit: details.limit });
        }
      }
    }
    if (response.status >= 500) reportCloudFailure(session.accessToken, "unavailable");
    throw new Error(failureMessage);
  }

  return { response, session };
}

async function requestAuthenticatedJson(
  path: `/v1/${string}`,
  accessToken: string,
  failureMessage: string,
  options: { method: "GET" | "PATCH" | "POST"; body?: object },
): Promise<unknown> {
  const { response, session } = await requestAuthenticated(
    path,
    accessToken,
    failureMessage,
    options,
  );
  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    assertCurrentRequest(session);
    throw new Error(failureMessage);
  }
  assertCurrentRequest(session);
  return payload;
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
  const { response, session } = await requestAuthenticated(
    path,
    accessToken,
    failureMessage,
    { method: "PUT", body },
  );
  assertCurrentRequest(session);
  if (response.status !== 204) throw new Error(failureMessage);
}

export async function postAuthenticatedJsonWithoutResponse(
  path: `/v1/${string}`,
  accessToken: string,
  body: object,
  failureMessage: string,
): Promise<void> {
  const { response, session } = await requestAuthenticated(
    path,
    accessToken,
    failureMessage,
    { method: "POST", body },
  );
  assertCurrentRequest(session);
  if (response.status !== 204) throw new Error(failureMessage);
}

export async function patchAuthenticatedJsonWithoutResponse(
  path: `/v1/${string}`,
  accessToken: string,
  body: object,
  failureMessage: string,
): Promise<void> {
  const { response, session } = await requestAuthenticated(
    path,
    accessToken,
    failureMessage,
    { method: "PATCH", body },
  );
  assertCurrentRequest(session);
  if (response.status !== 204) throw new Error(failureMessage);
}

export async function deleteAuthenticatedWithoutResponse(
  path: `/v1/${string}`,
  accessToken: string,
  failureMessage: string,
): Promise<void> {
  const { response, session } = await requestAuthenticated(
    path,
    accessToken,
    failureMessage,
    { method: "DELETE" },
  );
  assertCurrentRequest(session);
  if (response.status !== 204) throw new Error(failureMessage);
}
