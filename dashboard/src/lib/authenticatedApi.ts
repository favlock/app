import { API_URL } from "./appUrls";

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
    throw new Error("Please sign in again before continuing.");
  }

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
    });
  } catch {
    throw new Error(failureMessage);
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session expired. Please sign in again.");
    }
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
