import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthRequestSession } from "./favLockAuth";

const auth = vi.hoisted(() => ({
  getRequestSession: vi.fn<(accessToken: string) => Promise<AuthRequestSession>>(),
  refreshRequestSession: vi.fn<(session: AuthRequestSession) => Promise<AuthRequestSession>>(),
  isRequestSessionCurrent: vi.fn<(session: AuthRequestSession) => boolean>(),
  getConnectionError: vi.fn<() => Error | null>(),
}));

vi.mock("./favLockAuth", () => ({ favLockAuth: auth }));

import {
  deleteAuthenticatedWithoutResponse,
  fetchAuthenticatedJson,
  patchAuthenticatedJsonWithoutResponse,
  postAuthenticatedJson,
  postAuthenticatedJsonWithoutResponse,
  putAuthenticatedJsonWithoutResponse,
} from "./authenticatedApi";
import { CloudAccessError, subscribeToCloudFailures } from "./cloudAccess";

const session: AuthRequestSession = {
  accessToken: "current-access-token",
  userId: "11111111-1111-4111-8111-111111111111",
  generation: 1,
};
const refreshedSession: AuthRequestSession = { ...session, accessToken: "refreshed-access-token" };
const failureMessage = "The cloud operation could not be confirmed.";
const path = "/v1/bookmarks";
const fetchMock = vi.fn<typeof fetch>();
const cloudFailure = vi.fn();
let stopFailures: () => void;
let currentGeneration: number;
let currentUserId: string;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}

function readLibrary(): Promise<unknown> {
  return fetchAuthenticatedJson(path, "caller-access-token", failureMessage);
}

beforeEach(() => {
  currentGeneration = session.generation;
  currentUserId = session.userId;
  auth.getRequestSession.mockReset().mockResolvedValue(session);
  auth.refreshRequestSession.mockReset().mockResolvedValue(refreshedSession);
  auth.isRequestSessionCurrent.mockReset().mockImplementation((request) =>
    request.generation === currentGeneration && request.userId === currentUserId);
  auth.getConnectionError.mockReset().mockReturnValue(null);
  fetchMock.mockReset().mockResolvedValue(jsonResponse({ data: [] }));
  cloudFailure.mockReset();
  stopFailures = subscribeToCloudFailures(cloudFailure);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  stopFailures();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("session-aware authenticated requests", () => {
  it("resolves the current session token before sending a caller's saved token", async () => {
    await expect(readLibrary()).resolves.toEqual({ data: [] });
    expect(auth.getRequestSession).toHaveBeenCalledWith("caller-access-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/bookmarks",
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "application/json", Authorization: "Bearer current-access-token" },
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
      }),
    );
    expect(auth.refreshRequestSession).not.toHaveBeenCalled();
    expect(cloudFailure).not.toHaveBeenCalled();
  });

  it("waits for preflight refresh instead of sending an expired bearer", async () => {
    const preparing = deferred<AuthRequestSession>();
    auth.getRequestSession.mockReturnValueOnce(preparing.promise);
    const request = readLibrary();
    expect(fetchMock).not.toHaveBeenCalled();
    preparing.resolve(refreshedSession);
    await expect(request).resolves.toEqual({ data: [] });
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer refreshed-access-token",
    });
  });

  it("refreshes after a definite 401 and retries once without disconnecting", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ data: ["enc:bookmark"] }));

    await expect(readLibrary()).resolves.toEqual({ data: ["enc:bookmark"] });
    expect(auth.refreshRequestSession).toHaveBeenCalledExactlyOnceWith(session);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: "Bearer refreshed-access-token",
    });
    expect(cloudFailure).not.toHaveBeenCalled();
  });

  it("stops after a second 401 and reports only the bearer that was rejected", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 401 })));
    await expect(readLibrary()).rejects.toMatchObject({ code: "reconnect_required" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.refreshRequestSession).toHaveBeenCalledOnce();
    expect(cloudFailure).toHaveBeenCalledExactlyOnceWith({
      accessToken: refreshedSession.accessToken,
      status: "reconnect_required",
    });
  });

  it.each([
    ["PATCH", patchAuthenticatedJsonWithoutResponse],
    ["PUT", putAuthenticatedJsonWithoutResponse],
    ["POST", postAuthenticatedJsonWithoutResponse],
  ] as const)("retries an explicitly unauthenticated %s with the original ciphertext body", async (method, write) => {
    const body = { encryptedTitle: "enc:original" };
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    auth.refreshRequestSession.mockImplementationOnce(async () => {
      body.encryptedTitle = "enc:changed-during-refresh";
      return refreshedSession;
    });

    await expect(write(path, "caller-access-token", body, failureMessage)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options?.method).toBe(method);
      expect(options?.body).toBe(JSON.stringify({ encryptedTitle: "enc:original" }));
    }
  });

  it("retries an explicitly unauthenticated DELETE only once", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteAuthenticatedWithoutResponse(path, "caller-access-token", failureMessage)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.method).toBe("DELETE");
  });

  it.each([400, 403, 409, 429, 500, 503])("never replays a mutation after HTTP %s", async (status) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));
    await expect(postAuthenticatedJson(path, "caller-access-token", { encryptedTitle: "enc:test" }, failureMessage)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(auth.refreshRequestSession).not.toHaveBeenCalled();
    if (status === 403 || status >= 500) {
      expect(cloudFailure).toHaveBeenCalledExactlyOnceWith({
        accessToken: session.accessToken,
        status: status === 403 ? "restricted" : "unavailable",
      });
    } else {
      expect(cloudFailure).not.toHaveBeenCalled();
    }
  });

  it("never replays a checkout whose network result is uncertain", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(postAuthenticatedJson("/v1/billing/checkout", "caller-access-token", {
      attemptId: "22222222-2222-4222-8222-222222222222",
    }, failureMessage)).rejects.toMatchObject({ code: "unavailable", message: failureMessage });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(auth.refreshRequestSession).not.toHaveBeenCalled();
    expect(cloudFailure).toHaveBeenCalledExactlyOnceWith({
      accessToken: session.accessToken,
      status: "unavailable",
    });
  });

  it("does not replay a successful mutation with a malformed response body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    await expect(postAuthenticatedJson(path, "caller-access-token", { encryptedTitle: "enc:test" }, failureMessage)).rejects.toThrow(failureMessage);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(auth.refreshRequestSession).not.toHaveBeenCalled();
  });

  it.each(["unavailable", "restricted", "reconnect_required"] as const)("preserves a %s refresh failure without replay or another global failure", async (code) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    auth.refreshRequestSession.mockRejectedValueOnce(new CloudAccessError(code, "Refresh could not complete."));
    await expect(readLibrary()).rejects.toMatchObject({ code });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cloudFailure).not.toHaveBeenCalled();
  });

  it("retains structured quota errors without refreshing the session", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: {
      code: "quota_exceeded", details: { resource: "bookmarks", limit: 500 },
    } }, 400));
    await expect(readLibrary()).rejects.toMatchObject({
      code: "quota_exceeded", details: { resource: "bookmarks", limit: 500 },
    });
    expect(auth.refreshRequestSession).not.toHaveBeenCalled();
    expect(cloudFailure).not.toHaveBeenCalled();
  });

  it("rejects missing credentials and offline work before resolving a request session", async () => {
    await expect(fetchAuthenticatedJson(path, "", failureMessage)).rejects.toMatchObject({ code: "reconnect_required" });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await expect(readLibrary()).rejects.toMatchObject({ code: "unavailable" });
    expect(auth.getRequestSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send if a new sign-in wins while preparing the first request", async () => {
    const preparing = deferred<AuthRequestSession>();
    auth.getRequestSession.mockReturnValueOnce(preparing.promise);
    const rejection = expect(readLibrary()).rejects.toThrow("The account changed");
    currentGeneration += 1;
    preparing.resolve(session);
    await rejection;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cloudFailure).not.toHaveBeenCalled();
  });

  it("preserves a storage failure discovered before sending a prepared mutation", async () => {
    const preparing = deferred<AuthRequestSession>();
    auth.getRequestSession.mockReturnValueOnce(preparing.promise);
    const storageError = new CloudAccessError("unavailable", "This browser could not access session storage.");
    const rejection = expect(postAuthenticatedJson(path, "caller-access-token", {
      encryptedTitle: "enc:unsent",
    }, failureMessage)).rejects.toBe(storageError);

    auth.isRequestSessionCurrent.mockReturnValue(false);
    auth.getConnectionError.mockReturnValue(storageError);
    preparing.resolve(session);

    await rejection;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.refreshRequestSession).not.toHaveBeenCalled();
    expect(cloudFailure).not.toHaveBeenCalled();
  });

  it.each([200, 401, 403, 503])("preserves a storage failure while a mutation awaits HTTP %s without replaying it", async (status) => {
    const response = deferred<Response>();
    fetchMock.mockReturnValueOnce(response.promise);
    const storageError = new CloudAccessError("unavailable", "This browser could not access session storage.");
    const rejection = expect(postAuthenticatedJson(path, "caller-access-token", {
      encryptedTitle: "enc:sent-once",
    }, failureMessage)).rejects.toBe(storageError);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    auth.isRequestSessionCurrent.mockReturnValue(false);
    auth.getConnectionError.mockReturnValue(storageError);
    response.resolve(new Response(null, { status }));

    await rejection;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(auth.refreshRequestSession).not.toHaveBeenCalled();
    expect(cloudFailure).not.toHaveBeenCalled();
  });

  it.each([200, 400])("preserves a storage failure while an HTTP %s mutation body is parsed", async (status) => {
    const parsing = deferred<unknown>();
    const response = new Response(null, { status });
    const parse = vi.spyOn(response, "json").mockReturnValueOnce(parsing.promise);
    fetchMock.mockResolvedValueOnce(response);
    const storageError = new CloudAccessError("unavailable", "This browser could not access session storage.");
    const rejection = expect(postAuthenticatedJson(path, "caller-access-token", {
      encryptedTitle: "enc:sent-once",
    }, failureMessage)).rejects.toBe(storageError);
    await vi.waitFor(() => expect(parse).toHaveBeenCalledOnce());

    auth.isRequestSessionCurrent.mockReturnValue(false);
    auth.getConnectionError.mockReturnValue(storageError);
    parsing.resolve({ data: ["enc:bookmark"] });

    await rejection;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(auth.refreshRequestSession).not.toHaveBeenCalled();
    expect(cloudFailure).not.toHaveBeenCalled();
  });

  it("preserves a storage failure when a mutation response cannot be decoded", async () => {
    const parsing = deferred<unknown>();
    const response = new Response(null, { status: 200 });
    const parse = vi.spyOn(response, "json").mockReturnValueOnce(parsing.promise);
    fetchMock.mockResolvedValueOnce(response);
    const storageError = new CloudAccessError("unavailable", "This browser could not access session storage.");
    const rejection = expect(postAuthenticatedJson(path, "caller-access-token", {
      encryptedTitle: "enc:sent-once",
    }, failureMessage)).rejects.toBe(storageError);
    await vi.waitFor(() => expect(parse).toHaveBeenCalledOnce());

    auth.isRequestSessionCurrent.mockReturnValue(false);
    auth.getConnectionError.mockReturnValue(storageError);
    parsing.reject(new SyntaxError("The response was incomplete."));

    await rejection;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(auth.refreshRequestSession).not.toHaveBeenCalled();
    expect(cloudFailure).not.toHaveBeenCalled();
  });

  it.each([200, 401, 403, 503])("ignores HTTP %s from an earlier sign-in without poisoning current cloud status", async (status) => {
    const response = deferred<Response>();
    fetchMock.mockReturnValueOnce(response.promise);
    const rejection = expect(readLibrary()).rejects.toThrow("The account changed");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    currentGeneration += 1;
    response.resolve(new Response(null, { status }));
    await rejection;
    expect(auth.refreshRequestSession).not.toHaveBeenCalled();
    expect(cloudFailure).not.toHaveBeenCalled();
  });

  it.each(["generation", "account"] as const)("does not replay under a changed %s after refresh finishes", async (change) => {
    const refreshing = deferred<AuthRequestSession>();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    auth.refreshRequestSession.mockReturnValueOnce(refreshing.promise);
    const rejection = expect(postAuthenticatedJson(path, "caller-access-token", {
      encryptedTitle: "enc:original-account",
    }, failureMessage)).rejects.toThrow("The account changed");
    await vi.waitFor(() => expect(auth.refreshRequestSession).toHaveBeenCalledOnce());
    if (change === "generation") currentGeneration += 1;
    else currentUserId = "22222222-2222-4222-8222-222222222222";
    refreshing.resolve(refreshedSession);
    await rejection;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cloudFailure).not.toHaveBeenCalled();
  });

  it.each([200, 400])("retains the sign-in guard while an HTTP %s body is parsed", async (status) => {
    const parsing = deferred<unknown>();
    const response = new Response(null, { status });
    const parse = vi.spyOn(response, "json").mockReturnValueOnce(parsing.promise);
    fetchMock.mockResolvedValueOnce(response);
    const rejection = expect(readLibrary()).rejects.toThrow("The account changed");
    await vi.waitFor(() => expect(parse).toHaveBeenCalledOnce());
    currentGeneration += 1;
    parsing.resolve({ data: ["enc:previous-account"] });
    await rejection;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cloudFailure).not.toHaveBeenCalled();
  });

  it("does not accept a refreshed context from a different sign-in even if it is now current", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    auth.refreshRequestSession.mockImplementationOnce(async () => {
      currentGeneration += 1;
      return { ...refreshedSession, generation: currentGeneration };
    });
    await expect(postAuthenticatedJson(path, "caller-access-token", {
      encryptedTitle: "enc:original-sign-in",
    }, failureMessage)).rejects.toThrow("The account changed");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cloudFailure).not.toHaveBeenCalled();
  });
});
