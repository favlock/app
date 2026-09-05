import { API_URL, DASHBOARD_URL } from "./appUrls";
import { readLocalVaultCloudMerge } from "./localVaultCloudMerge";
import { captureInitialPasswordRecoveryRedirect } from "./authRecovery";
import { readAuthUrl } from "./authUrl";
import { hasAuthCallback, readAuthCallbackFailure, withoutAuthCallback, type AuthCallbackFailure } from "./authCallback";
import { CloudAccessError, cloudStatusMessage, subscribeToCloudFailures, type CloudStatus } from "./cloudAccess";

const SESSION_STORAGE_KEY = "favlock.auth.session.v1";
export const LOCAL_PROFILE_STORAGE_KEY = "favlock.local-profile.v1";
const LOCAL_ACCOUNT_EPOCH_STORAGE_KEY = "favlock.local-account-epoch.v1";
const PKCE_STORAGE_KEY = "favlock.auth.pkce.v1";
const LEGACY_STORAGE_KEY = "sb-auth";
const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const REFRESH_LOCK_TIMEOUT_MS = 8_000;
const REFRESH_MARGIN_MS = 60_000;
const REFRESH_RETRY_MS = 30_000;
const MAX_REMEMBERED_ACCESS_TOKENS = 8;
const LOCAL_ACCOUNT_CHANGED_MESSAGE = "Your account changed in another tab. Reload to continue.";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type OAuthProvider = "apple" | "google";

captureInitialPasswordRecoveryRedirect();

export interface AuthIdentity {
  provider: string;
}

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  identities?: AuthIdentity[];
  /** Local vault identity only. It never authorizes a cloud request. */
  local_only?: boolean;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: "bearer";
  user: AuthUser;
  /** Local persistence revision; never supplied by or used to authorize the API. */
  local_revision?: string;
}

export interface AuthRequestSession {
  readonly accessToken: string;
  readonly userId: string;
  readonly generation: number;
}

interface RefreshAttempt {
  readonly session: AuthSession;
  readonly generation: number;
}

export type AuthChangeEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "LOCAL_ACCOUNT_INVALIDATED"
  | "SESSION_STALE"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY"
  | "LOCAL_ACCOUNT_CREATED";

interface StoredPkce {
  verifier: string;
  redirectType: "sign-in" | "recovery";
  localAccountEpoch?: string | null;
}

interface AuthResult<T> {
  data: T;
  error: Error | null;
}

interface AuthClientOptions {
  apiUrl?: string;
  authUrl?: string;
  dashboardUrl?: string;
  fetchImplementation?: typeof fetch;
  navigate?: (url: string) => void;
}

type AuthChangeCallback = (
  event: AuthChangeEvent,
  session: AuthSession | null,
) => void | Promise<void>;

class AuthRequestError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status = 0, code: string | null = null) {
    super(message);
    this.name = "AuthRequestError";
    this.status = status;
    this.code = code;
  }
}

class AuthStorageError extends CloudAccessError {
  constructor() {
    super("unavailable", "Your browser could not access session storage. Check this site's storage settings and try again.");
    this.name = "AuthStorageError";
  }
}

function readStorageItem(key: string): string | null {
  try { return localStorage.getItem(key); }
  catch { throw new AuthStorageError(); }
}

function writeStorageItem(key: string, value: string): void {
  try { localStorage.setItem(key, value); }
  catch { throw new AuthStorageError(); }
}

function removeStorageItem(key: string): void {
  try { localStorage.removeItem(key); }
  catch { throw new AuthStorageError(); }
}

interface StoredLocalProfile {
  user: AuthUser;
  cloudStatus: CloudStatus;
  refreshRejected: boolean;
  sessionRevision: string | null;
}

interface LocalAccountMarker {
  id: string;
  signedOut: boolean;
}

interface PendingRotation extends RefreshAttempt {
  replacement: AuthSession;
  epoch: string | null | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, maximum: number): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum
    ? value
    : null;
}

function readPositiveInteger(value: unknown, maximum?: number): number | null {
  return Number.isSafeInteger(value) &&
    (value as number) > 0 &&
    (maximum === undefined || (value as number) <= maximum)
    ? (value as number)
    : null;
}

function mapUser(value: unknown, passwordFallback = false): AuthUser | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id, 64);
  const email = readString(value.email, 254);
  const firstName =
    typeof value.firstName === "string" ? value.firstName.slice(0, 256) : "";
  const lastName =
    typeof value.lastName === "string" ? value.lastName.slice(0, 256) : "";
  const createdAt = readString(value.createdAt, 64);
  const passwordSignInEnabled =
    value.passwordSignInEnabled === true || passwordFallback;
  if (
    !id ||
    !UUID_PATTERN.test(id) ||
    !email ||
    !createdAt ||
    !Number.isFinite(Date.parse(createdAt))
  ) {
    return null;
  }
  return {
    id,
    email,
    created_at: createdAt,
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      password_sign_in_enabled: passwordSignInEnabled,
    },
    app_metadata: {
      provider: passwordSignInEnabled ? "email" : "google",
      providers: [passwordSignInEnabled ? "email" : "google"],
    },
    identities: [{ provider: passwordSignInEnabled ? "email" : "google" }],
  };
}

function mapApiSession(value: unknown, passwordFallback = false): AuthSession | null {
  if (!isRecord(value)) return null;
  const accessToken = readString(value.accessToken, 16_384);
  const refreshToken = readString(value.refreshToken, 16_384);
  const expiresIn = readPositiveInteger(value.expiresIn, 604_800);
  const expiresAt = readPositiveInteger(value.expiresAt);
  const user = mapUser(value.user, passwordFallback);
  if (!accessToken || !refreshToken || !expiresIn || !expiresAt || !user) {
    return null;
  }
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    expires_at: expiresAt,
    token_type: "bearer",
    user,
  };
}

function mapStoredUser(value: unknown): AuthUser | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id, 64);
  const localOnly = value.local_only === true;
  const email = localOnly && value.email === "" ? "" : readString(value.email, 254);
  const createdAt = readString(value.created_at, 64);
  if (
    !id ||
    !UUID_PATTERN.test(id) ||
    email === null ||
    !createdAt ||
    !Number.isFinite(Date.parse(createdAt))
  ) {
    return null;
  }
  return {
    id,
    email,
    created_at: createdAt,
    user_metadata: isRecord(value.user_metadata) ? value.user_metadata : {},
    app_metadata: isRecord(value.app_metadata) ? value.app_metadata : {},
    identities: Array.isArray(value.identities)
      ? value.identities
          .filter(
            (identity): identity is Record<string, unknown> =>
              isRecord(identity) && typeof identity.provider === "string",
          )
          .map((identity) => ({ provider: identity.provider as string }))
      : undefined,
    ...(localOnly ? { local_only: true } : {}),
  };
}

export function isLocalOnlyUser(user: AuthUser | null | undefined): boolean {
  return user?.local_only === true;
}

function mapStoredSession(value: unknown): AuthSession | null {
  if (!isRecord(value)) return null;
  const accessToken = readString(value.access_token, 16_384);
  const refreshToken = readString(value.refresh_token, 16_384);
  const expiresAt = readPositiveInteger(value.expires_at);
  const expiresIn =
    readPositiveInteger(value.expires_in, 604_800) ??
    (expiresAt ? Math.max(1, expiresAt - Math.floor(Date.now() / 1000)) : null);
  const user = mapStoredUser(value.user);
  if (!accessToken || !refreshToken || !expiresAt || !expiresIn || !user) {
    return null;
  }
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    expires_at: expiresAt,
    token_type: "bearer",
    user,
    ...(typeof value.local_revision === "string" && UUID_PATTERN.test(value.local_revision)
      ? { local_revision: value.local_revision } : {}),
  };
}

function readTokenSession(accessToken: string): { userId: string; sessionId: string } | null {
  // These unverified claims only bind local work to a session. The server still
  // authenticates every request; decoding a token never grants cloud access.
  if (accessToken.length > 16_384) return null;
  const parts = accessToken.split(".");
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  try {
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")), (value) => value.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isRecord(value) || typeof value.sub !== "string" || typeof value.session_id !== "string" ||
      !UUID_PATTERN.test(value.sub) || !UUID_PATTERN.test(value.session_id)) return null;
    return { userId: value.sub, sessionId: value.session_id };
  } catch {
    return null;
  }
}

function belongsToSameSession(first: AuthSession, second: AuthSession): boolean {
  if (first.user.id !== second.user.id) return false;
  if (first.access_token === second.access_token || first.refresh_token === second.refresh_token) return true;
  const firstIdentity = readTokenSession(first.access_token);
  const secondIdentity = readTokenSession(second.access_token);
  return !!firstIdentity && !!secondIdentity && firstIdentity.userId === first.user.id &&
    secondIdentity.userId === second.user.id && firstIdentity.sessionId === secondIdentity.sessionId;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

function readRedirectTarget(value: string, dashboardUrl: string): string | null {
  try {
    const dashboard = new URL(`${dashboardUrl}/`);
    const destination = new URL(value);
    if (destination.origin !== dashboard.origin) return null;
    const target = `${destination.pathname}${destination.search}${destination.hash}`;
    return target.startsWith("/") && !target.startsWith("//") && target.length <= 2048
      ? target
      : null;
  } catch {
    return null;
  }
}

function readCookie(name: string): string | null {
  const encodedName = encodeURIComponent(name);
  for (const item of document.cookie.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === encodedName || key === name) return parts.join("=");
  }
  return null;
}

function readChunkedCookie(name: string): string | null {
  const direct = readCookie(name);
  if (direct) return direct;
  const chunks: string[] = [];
  for (let index = 0; ; index += 1) {
    const chunk = readCookie(`${name}.${index}`);
    if (!chunk) break;
    chunks.push(chunk);
  }
  return chunks.length ? chunks.join("") : null;
}

function decodeLegacyCookie(name: string): unknown {
  const raw = readChunkedCookie(name);
  if (!raw) return null;
  try {
    let decoded = decodeURIComponent(raw);
    if (decoded.startsWith("base64-")) {
      const encoded = decoded.slice("base64-".length).replace(/-/g, "+").replace(/_/g, "/");
      const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
      const bytes = Uint8Array.from(atob(padded), (character) =>
        character.charCodeAt(0),
      );
      decoded = new TextDecoder().decode(bytes);
    }
    return JSON.parse(decoded) as unknown;
  } catch {
    return null;
  }
}

function clearLegacyCookie(name: string): void {
  const names = document.cookie
    .split(";")
    .map((item) => item.trim().split("=")[0])
    .filter(
      (cookieName): cookieName is string =>
        cookieName === name || cookieName.startsWith(`${name}.`),
    );
  for (const cookieName of names) {
    document.cookie = `${cookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
}

function readStoredPkce(): StoredPkce | null {
  const raw = readStorageItem(PKCE_STORAGE_KEY);
  try {
    const value = JSON.parse(raw ?? "null") as unknown;
    if (!isRecord(value)) return null;
    const verifier = readString(value.verifier, 128);
    const redirectType = value.redirectType;
    if (
      !verifier ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
      !["sign-in", "recovery"].includes(redirectType as string) ||
      (value.localAccountEpoch !== undefined && value.localAccountEpoch !== null &&
        (typeof value.localAccountEpoch !== "string" || !UUID_PATTERN.test(value.localAccountEpoch)))
    ) {
      return null;
    }
    return { verifier, redirectType: redirectType as StoredPkce["redirectType"],
      ...(value.localAccountEpoch !== undefined ? { localAccountEpoch: value.localAccountEpoch as string | null } : {}) };
  } catch {
    return null;
  }
}

function isDefinitiveClientError(error: unknown): boolean {
  return (
    error instanceof AuthRequestError &&
    error.status >= 400 &&
    error.status < 500
  );
}

function isExpiredSessionError(error: unknown): boolean {
  return error instanceof AuthRequestError && error.status === 401;
}

export class FavLockAuthClient {
  readonly #apiUrl: string;
  readonly #authUrl: string;
  readonly #dashboardUrl: string;
  readonly #fetch: typeof fetch;
  readonly #navigate: (url: string) => void;
  readonly #subscribers = new Set<AuthChangeCallback>();
  #session: AuthSession | null = null;
  #localUser: AuthUser | null = null;
  #localAccountEpoch: string | null | undefined;
  #localAccountState: "active" | "signed_out" | "invalidated" = "active";
  #cloudStatus: CloudStatus = "signed_out";
  #generation = 0;
  #refreshRejected = false;
  readonly #knownAccessTokens = new Set<string>();
  #stopCloudFailures: (() => void) | null = null;
  #initialization: Promise<AuthResult<{ session: AuthSession | null }>> | null = null;
  #initializationError: Error | null = null;
  #callbackFailure: AuthCallbackFailure | null = null;
  #storageError: AuthStorageError | null = null;
  #profileNeedsRepair = false;
  #pendingLocalAccountActivation = false;
  #pendingRotation: PendingRotation | null = null;
  #refreshPromise: Promise<AuthSession> | null = null;
  #refreshLockAbort: AbortController | null = null;
  #refreshTimer: number | null = null;
  #synchronizationCount = 0;
  #disposed = false;

  constructor({
    apiUrl = API_URL,
    authUrl = readAuthUrl(import.meta.env.VITE_AUTH_URL, import.meta.env.PROD),
    dashboardUrl = DASHBOARD_URL,
    fetchImplementation = fetch,
    navigate = (url) => window.location.assign(url),
  }: AuthClientOptions = {}) {
    this.#apiUrl = apiUrl.replace(/\/+$/, "");
    this.#authUrl = authUrl.replace(/\/+$/, "");
    this.#dashboardUrl = dashboardUrl.replace(/\/+$/, "");
    this.#fetch = fetchImplementation.bind(globalThis);
    this.#navigate = navigate;
  }

  async #request(
    path: `/v1/auth/${string}`,
    method: "GET" | "POST" | "PATCH",
    body?: Record<string, unknown>,
    accessToken?: string,
  ): Promise<unknown> {
    let response: Response;
    let text: string;
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(
      () => abortController.abort(),
      REQUEST_TIMEOUT_MS,
    );
    try {
      response = await this.#fetch(`${this.#apiUrl}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
        signal: abortController.signal,
      });
      text = await response.text();
    } catch {
      throw new AuthRequestError("Authentication is temporarily unavailable.");
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (text.length > MAX_RESPONSE_BYTES) {
      throw new AuthRequestError("Authentication is temporarily unavailable.");
    }
    let value: unknown = null;
    if (text) {
      try {
        value = JSON.parse(text) as unknown;
      } catch {
        throw new AuthRequestError("Authentication is temporarily unavailable.");
      }
    }
    if (!response.ok) {
      const message =
        isRecord(value) &&
        isRecord(value.error) &&
        readString(value.error.message, 512);
      throw new AuthRequestError(
        message || "The authentication request could not be completed.",
        response.status,
        isRecord(value) && isRecord(value.error) &&
          ["rate_limited", "email_not_confirmed", "invalid_auth_link"].includes(String(value.error.code))
          ? String(value.error.code) : null,
      );
    }
    return value;
  }

  #notify(event: AuthChangeEvent, session: AuthSession | null): void {
    const generation = this.#generation;
    for (const subscriber of this.#subscribers) {
      queueMicrotask(() => {
        if (!this.#subscribers.has(subscriber)) return;
        if (event !== "SIGNED_OUT" && event !== "LOCAL_ACCOUNT_INVALIDATED" &&
          (generation !== this.#generation || session !== this.#session)) return;
        void subscriber(event, session);
      });
    }
  }

  #advanceGeneration(): void {
    this.#generation += 1;
    this.#knownAccessTokens.clear();
    this.#refreshPromise = null;
    this.#pendingRotation = null;
    this.#refreshLockAbort?.abort();
    this.#refreshLockAbort = null;
  }

  #rememberAccessToken(accessToken: string): void {
    this.#knownAccessTokens.add(accessToken);
    if (this.#knownAccessTokens.size > MAX_REMEMBERED_ACCESS_TOKENS) {
      const oldest = this.#knownAccessTokens.values().next().value;
      if (oldest) this.#knownAccessTokens.delete(oldest);
    }
  }

  #saveSession(session: AuthSession, event: AuthChangeEvent): void {
    if (this.#disposed || this.#localAccountState === "invalidated") throw new Error(LOCAL_ACCOUNT_CHANGED_MESSAGE);
    const localUser = this.getLocalUser();
    const mergeIntent = readLocalVaultCloudMerge();
    const allowsLocalMerge = !!localUser?.local_only &&
      localUser.id !== session.user.id &&
      mergeIntent?.sourceVaultId === localUser.id;
    if (localUser && localUser.id !== session.user.id && !allowsLocalMerge) {
      throw new Error("This is a different account. Your local vault was not changed. Export it before explicitly signing out, or use a separate browser profile.");
    }
    try {
      const marker = this.#readLocalAccountMarker();
      const profile = marker?.signedOut ? null : this.#readLocalProfile();
      const epoch = marker?.id ?? profile?.user.id ?? null;
      if (localUser && this.#localAccountEpoch !== undefined && epoch !== this.#localAccountEpoch) {
        this.#invalidateLocalAccount();
        throw new Error(LOCAL_ACCOUNT_CHANGED_MESSAGE);
      }
      if (profile && profile.user.id !== session.user.id && !allowsLocalMerge) {
        throw new Error("This is a different account. Your local vault was not changed. Export it before explicitly signing out, or use a separate browser profile.");
      }
      const nextEpoch = epoch ?? this.#localAccountEpoch ?? crypto.randomUUID();
      if (!marker && !localUser) {
        writeStorageItem(LOCAL_ACCOUNT_EPOCH_STORAGE_KEY, JSON.stringify({ id: nextEpoch, signedOut: true } satisfies LocalAccountMarker));
      }
      session = { ...session, local_revision: event === "USER_UPDATED"
        ? this.#session?.local_revision ?? crypto.randomUUID() : crypto.randomUUID() };
      // Persist the rotated credential before publishing a usable session. A
      // later profile-write failure must never roll this credential back.
      writeStorageItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      this.#localAccountEpoch = nextEpoch;
      this.#pendingLocalAccountActivation = !marker || marker.signedOut;
    } catch (error) {
      if (error instanceof AuthStorageError) this.#recordStorageFailure(error);
      throw error;
    }
    if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") this.#advanceGeneration();
    this.#localAccountState = "active";
    this.#localUser = session.user;
    this.#cloudStatus = "available";
    this.#refreshRejected = false;
    this.#initializationError = null;
    this.#callbackFailure = null;
    this.#session = session;
    this.#rememberAccessToken(session.access_token);
    this.#profileNeedsRepair = true;
    try {
      this.#persistLocalProfile();
      this.#activatePersistedAccount();
      this.#profileNeedsRepair = false;
      this.#clearStorageFailure();
    } catch (error) {
      if (error instanceof AuthStorageError) this.#recordStorageFailure(error);
      throw error;
    }
    this.#scheduleRefresh();
    this.#notify(event, session);
  }

  #removeSession(notify = true): void {
    this.#session = null;
    this.#knownAccessTokens.clear();
    this.#initializationError = null;
    if (this.#refreshTimer !== null) window.clearTimeout(this.#refreshTimer);
    this.#refreshTimer = null;
    try { removeStorageItem(SESSION_STORAGE_KEY); }
    finally { if (notify) this.#notify("SIGNED_OUT", null); }
  }

  #persistLocalProfile(): void {
    if (!this.#localUser) return;
    const user = this.#localUser;
    writeStorageItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1,
      user: { id: user.id, email: user.email, created_at: user.created_at,
        ...(user.local_only ? { local_only: true } : {}), user_metadata: {
        first_name: readString(user.user_metadata.first_name, 256) ?? "",
        last_name: readString(user.user_metadata.last_name, 256) ?? "",
        password_sign_in_enabled: user.user_metadata.password_sign_in_enabled === true,
      }, app_metadata: {
        provider: user.app_metadata.provider === "apple" || user.app_metadata.provider === "google"
          ? user.app_metadata.provider
          : "email",
        providers: Array.isArray(user.app_metadata.providers) ? user.app_metadata.providers.filter((value) => value === "apple" || value === "email" || value === "google") : [],
      }, identities: user.identities?.filter(({ provider }) => provider === "apple" || provider === "email" || provider === "google") },
      cloudStatus: this.#cloudStatus,
      refreshRejected: this.#refreshRejected,
      sessionRevision: this.#session?.local_revision ?? null,
    }));
  }

  #readLocalProfile(): StoredLocalProfile | null {
    const raw = readStorageItem(LOCAL_PROFILE_STORAGE_KEY);
    if (raw === null) return null;
    try {
      const value: unknown = JSON.parse(raw);
      const user = isRecord(value) && value.version === 1 ? mapStoredUser(value.user) : null;
      if (!isRecord(value) || !user) return null;
      const cloudStatus = value.cloudStatus === "restricted" || value.cloudStatus === "reconnect_required" ||
        value.cloudStatus === "unavailable" ? value.cloudStatus : "available";
      return { user, cloudStatus, refreshRejected: value.refreshRejected === true,
        sessionRevision: typeof value.sessionRevision === "string" && UUID_PATTERN.test(value.sessionRevision) ? value.sessionRevision : null };
    } catch { return null; }
  }

  #readLocalAccountEpoch(legacyUser?: AuthUser): string | null {
    // Legacy profiles get a deterministic initial epoch without a migration
    // write or a forced login. Explicit logout always replaces this marker.
    return this.#readLocalAccountMarker()?.id ?? legacyUser?.id ??
      this.#readLocalProfile()?.user.id ?? this.#readStoredSession()?.user.id ?? null;
  }

  #readLocalAccountMarker(): LocalAccountMarker | null {
    const raw = readStorageItem(LOCAL_ACCOUNT_EPOCH_STORAGE_KEY);
    if (!raw) return null;
    try {
      const value: unknown = JSON.parse(raw);
      if (isRecord(value) && typeof value.id === "string" && UUID_PATTERN.test(value.id) &&
        typeof value.signedOut === "boolean") return { id: value.id, signedOut: value.signedOut };
    } catch { /* Ignore malformed local metadata, not storage-access errors. */ }
    return null;
  }

  #activatePersistedAccount(): void {
    if (!this.#pendingLocalAccountActivation || !this.#localAccountEpoch) return;
    writeStorageItem(LOCAL_ACCOUNT_EPOCH_STORAGE_KEY, JSON.stringify({ id: this.#localAccountEpoch, signedOut: false } satisfies LocalAccountMarker));
    this.#pendingLocalAccountActivation = false;
  }

  #recordStorageFailure(error: AuthStorageError): void {
    const changed = this.#storageError === null;
    this.#storageError = error;
    this.#initializationError = error;
    this.#scheduleRefresh();
    if (changed) this.#notify("SESSION_STALE", this.#session);
  }

  #clearStorageFailure(): void {
    const previous = this.#storageError;
    this.#storageError = null;
    if (this.#initializationError === previous) this.#initializationError = null;
    if (previous) this.#notify("SESSION_STALE", this.#session);
  }

  #invalidateLocalAccount(): void {
    if (this.#localAccountState === "invalidated") return;
    this.#advanceGeneration();
    this.#localAccountState = "invalidated";
    this.#localUser = null;
    this.#session = null;
    this.#cloudStatus = "signed_out";
    this.#refreshRejected = false;
    this.#profileNeedsRepair = false;
    this.#pendingLocalAccountActivation = false;
    this.#storageError = null;
    this.#initializationError = new Error(LOCAL_ACCOUNT_CHANGED_MESSAGE);
    this.#scheduleRefresh();
    // Only this tab is invalidated. A newer login may already own shared
    // credentials, keys, and caches; do not run destructive logout cleanup.
    this.#notify("LOCAL_ACCOUNT_INVALIDATED", null);
  }

  getLocalUser(): AuthUser | null {
    if (this.#localAccountState !== "active") return null;
    if (this.#localUser) return this.#localUser;
    if (this.#storageError) return null;
    try {
      const marker = this.#readLocalAccountMarker();
      if (marker?.signedOut) {
        this.#localAccountEpoch = marker.id;
        return null;
      }
      const profile = this.#readLocalProfile();
      if (profile) {
        this.#localUser = profile.user;
        this.#localAccountEpoch = this.#readLocalAccountEpoch(profile.user);
        this.#cloudStatus = profile.cloudStatus;
        this.#refreshRejected = profile.refreshRejected;
      }
      if (!this.#localUser) {
        const legacy = this.#readStoredSession();
        if (legacy) {
          this.#localUser = legacy.user;
          this.#localAccountEpoch = this.#readLocalAccountEpoch(legacy.user);
          this.#cloudStatus = "available";
          this.#profileNeedsRepair = true;
          this.#persistLocalProfile();
          this.#profileNeedsRepair = false;
        }
      }
    } catch (error) {
      if (error instanceof AuthStorageError) this.#recordStorageFailure(error);
    }
    return this.#localUser;
  }

  getConnectionError(): Error | null {
    return this.#initializationError;
  }

  isLocalAccountInvalidated(): boolean {
    return this.#localAccountState === "invalidated";
  }

  getCloudStatus(): CloudStatus {
    if (!this.getLocalUser()) return "signed_out";
    if (!navigator.onLine) return "offline";
    if (this.#storageError) return "unavailable";
    if (!this.#session) return "reconnect_required";
    if (this.#cloudStatus === "available" && this.#session.expires_at * 1000 <= Date.now()) return "unavailable";
    return this.#cloudStatus;
  }

  async createLocalAccount(): Promise<AuthResult<{ user: AuthUser | null }>> {
    try {
      await this.initialize();
      if (this.getLocalUser()) {
        return {
          data: { user: null },
          error: new Error("A FavLock vault is already open in this browser profile."),
        };
      }
      if (this.#disposed || this.#localAccountState === "invalidated") {
        throw new Error(LOCAL_ACCOUNT_CHANGED_MESSAGE);
      }
      const user: AuthUser = {
        id: crypto.randomUUID(),
        email: "",
        created_at: new Date().toISOString(),
        user_metadata: {},
        app_metadata: { provider: "local", providers: [] },
        identities: [],
        local_only: true,
      };
      const epoch = crypto.randomUUID();
      this.#advanceGeneration();
      this.#localAccountState = "active";
      this.#localAccountEpoch = epoch;
      this.#localUser = user;
      this.#session = null;
      this.#cloudStatus = "reconnect_required";
      this.#refreshRejected = true;
      writeStorageItem(
        LOCAL_ACCOUNT_EPOCH_STORAGE_KEY,
        JSON.stringify({ id: epoch, signedOut: false } satisfies LocalAccountMarker),
      );
      this.#persistLocalProfile();
      this.#notify("LOCAL_ACCOUNT_CREATED", null);
      return { data: { user }, error: null };
    } catch (error) {
      if (error instanceof AuthStorageError) this.#recordStorageFailure(error);
      return {
        data: { user: null },
        error: error instanceof Error
          ? error
          : new Error("Could not create the local vault."),
      };
    }
  }

  markCloudFailure(accessToken: string, status: "reconnect_required" | "restricted" | "unavailable"): void {
    if (accessToken !== this.#session?.access_token) return;
    try {
      this.#synchronizeStoredSession();
      if (accessToken !== this.#session?.access_token) return;
      // A late network error cannot restart automatic recovery after a denial.
      if ((this.#cloudStatus === "restricted" || this.#cloudStatus === "reconnect_required") && status === "unavailable") return;
      this.#cloudStatus = status;
      this.#profileNeedsRepair = true;
      this.#persistLocalProfile();
      this.#profileNeedsRepair = false;
    } catch (error) {
      if (error instanceof AuthStorageError) this.#recordStorageFailure(error);
      return;
    }
    this.#scheduleRefresh();
    this.#notify("SESSION_STALE", this.#session);
  }

  async retryCloudConnection(): Promise<void> {
    await this.initialize();
    try { this.#synchronizeStoredSession(); }
    catch (error) {
      if (error instanceof AuthStorageError) this.#recordStorageFailure(error);
      throw error;
    }
    if (this.#storageError) throw this.#storageError;
    if (this.#localAccountState === "invalidated") throw new Error(LOCAL_ACCOUNT_CHANGED_MESSAGE);
    if (!navigator.onLine) throw new Error(cloudStatusMessage("offline"));
    if (!this.#session) throw new Error(cloudStatusMessage("reconnect_required"));
    const attempt = { session: this.#session, generation: this.#generation };
    try {
      await this.#refreshSession(true);
    } catch (error) {
      // A newer successful login can win after the refresh promise rejected,
      // but before this continuation runs. Do not display that obsolete error.
      if (this.#replacementSession(attempt)) return;
      throw error;
    }
  }

  #recordRefreshFailure(error: unknown, attempt: RefreshAttempt): void {
    if (error instanceof AuthStorageError) {
      this.#recordStorageFailure(error);
      return;
    }
    if (!this.#session || this.#generation !== attempt.generation ||
      this.#session.refresh_token !== attempt.session.refresh_token ||
      this.#readStoredSession()?.refresh_token !== attempt.session.refresh_token) return;
    this.#refreshRejected = isExpiredSessionError(error);
    this.#initializationError = error instanceof Error ? error : new Error("Authentication failed.");
    this.markCloudFailure(this.#session.access_token,
      error instanceof AuthRequestError && error.status === 403 ? "restricted" :
      isExpiredSessionError(error) ? "reconnect_required" : "unavailable");
  }

  #readStoredSession(): AuthSession | null {
    const raw = readStorageItem(SESSION_STORAGE_KEY);
    if (raw === null) return null;
    let session: AuthSession | null;
    try {
      session = mapStoredSession(JSON.parse(raw) as unknown);
    } catch { session = null; }
    if (!session) removeStorageItem(SESSION_STORAGE_KEY);
    return session;
  }

  #adoptSession(session: AuthSession): void {
    const sameSession = this.#session && belongsToSameSession(this.#session, session);
    if (!sameSession) this.#advanceGeneration();
    this.#session = session;
    this.#localUser = session.user;
    this.#cloudStatus = "available";
    this.#refreshRejected = false;
    if (!this.#storageError) this.#initializationError = null;
    this.#rememberAccessToken(session.access_token);
    this.#scheduleRefresh();
    this.#notify(sameSession ? "TOKEN_REFRESHED" : "SIGNED_IN", session);
  }

  #synchronizeStoredSession(): void {
    if (this.#localAccountState !== "active" || this.#disposed) return;
    const marker = this.#readLocalAccountMarker();
    const profile = this.#readLocalProfile();
    const stored = this.#readStoredSession();
    const epoch = marker?.id ?? profile?.user.id ?? stored?.user.id ?? null;
    const finishingOwnLogin = this.#pendingLocalAccountActivation &&
      epoch === this.#localAccountEpoch && !!stored && stored.local_revision === this.#session?.local_revision;
    if (this.#localUser && (
      (this.#localAccountEpoch !== undefined && epoch !== this.#localAccountEpoch) ||
      (marker?.signedOut && !finishingOwnLogin) ||
      (profile && profile.user.id !== this.#localUser.id && !finishingOwnLogin) ||
      (stored && stored.user.id !== this.#localUser.id) ||
      (!profile && !this.#profileNeedsRepair && readStorageItem(LOCAL_PROFILE_STORAGE_KEY) === null)
    )) {
      this.#invalidateLocalAccount();
      return;
    }
    if (marker?.signedOut && !finishingOwnLogin) {
      this.#session = null;
      this.#clearStorageFailure();
      return;
    }
    if (this.#pendingRotation) {
      const pending = this.#pendingRotation;
      if (pending.generation === this.#generation && pending.epoch === epoch &&
        stored?.refresh_token === pending.session.refresh_token && this.#localUser?.id === pending.session.user.id) {
        this.#saveSession(pending.replacement, "TOKEN_REFRESHED");
        this.#pendingRotation = null;
        return;
      }
      this.#pendingRotation = null;
    }
    if (!this.#localUser && profile) {
      this.#localUser = profile.user;
      this.#localAccountEpoch = epoch;
      this.#cloudStatus = profile.cloudStatus;
      this.#refreshRejected = profile.refreshRejected;
    }
    if (stored?.local_revision && profile && stored.user.id === profile.user.id &&
      stored.local_revision !== profile.sessionRevision) {
      // A partial write can leave an old denial beside newly issued tokens.
      // The marker describes only its own credential revision.
      this.#cloudStatus = "available";
      this.#refreshRejected = false;
      this.#profileNeedsRepair = true;
    }
    if (stored && stored.user.id === this.#localUser?.id &&
      (stored.access_token !== this.#session?.access_token || stored.refresh_token !== this.#session?.refresh_token ||
        stored.local_revision !== this.#session?.local_revision)) {
      this.#adoptSession(stored);
    } else if (!stored && this.#session) {
      this.#advanceGeneration();
      this.#session = null;
      this.#cloudStatus = "reconnect_required";
      this.#scheduleRefresh();
      this.#notify("SESSION_STALE", null);
    }
    if (this.#profileNeedsRepair) {
      this.#persistLocalProfile();
      this.#activatePersistedAccount();
      this.#profileNeedsRepair = false;
    }
    this.#clearStorageFailure();
  }

  #replacementSession(attempt: RefreshAttempt): AuthSession | null {
    if (this.#disposed || this.#localAccountState !== "active" || this.#storageError) return null;
    let latest: AuthSession | null;
    try {
      this.#synchronizeStoredSession();
      latest = this.#readStoredSession();
    } catch (error) {
      if (error instanceof AuthStorageError) this.#recordStorageFailure(error);
      return null;
    }
    if (!latest || latest.user.id !== attempt.session.user.id ||
      latest.user.id !== this.getLocalUser()?.id || latest.expires_at * 1000 <= Date.now() ||
      (this.#generation === attempt.generation && latest.refresh_token === attempt.session.refresh_token)) return null;
    if (this.#session?.access_token !== latest.access_token || this.#session.refresh_token !== latest.refresh_token) {
      this.#adoptSession(latest);
    }
    return this.#session;
  }

  #tokenBelongsToSession(accessToken: string, session: AuthSession): boolean {
    if (accessToken === session.access_token || this.#knownAccessTokens.has(accessToken)) return true;
    const callerIdentity = readTokenSession(accessToken);
    const currentIdentity = readTokenSession(session.access_token);
    return !!callerIdentity && !!currentIdentity && callerIdentity.userId === session.user.id &&
      currentIdentity.userId === session.user.id && callerIdentity.sessionId === currentIdentity.sessionId;
  }

  isRequestSessionCurrent(request: AuthRequestSession): boolean {
    try { this.#synchronizeStoredSession(); }
    catch (error) {
      if (error instanceof AuthStorageError) this.#recordStorageFailure(error);
      return false;
    }
    const session = this.#session;
    return !this.#disposed && this.#localAccountState === "active" && !this.#storageError &&
      !!session && request.generation === this.#generation && request.userId === session.user.id &&
      this.#tokenBelongsToSession(request.accessToken, session);
  }

  #synchronizeForRequest(): void {
    try { this.#synchronizeStoredSession(); }
    catch (error) {
      if (!(error instanceof AuthStorageError)) throw error;
      this.#recordStorageFailure(error);
      throw this.#cloudRequestError();
    }
    if (this.#storageError) throw this.#cloudRequestError();
  }

  #assertRequestCurrent(request: AuthRequestSession): void {
    if (this.isRequestSessionCurrent(request)) return;
    if (this.#storageError) throw this.#cloudRequestError();
    throw new Error("The account changed. Please try again.");
  }

  #requestSession(): AuthRequestSession {
    if (!this.#session) throw this.#cloudRequestError();
    return { accessToken: this.#session.access_token, userId: this.#session.user.id, generation: this.#generation };
  }

  #cloudRequestError(): CloudAccessError {
    if (this.#storageError) return new CloudAccessError("unavailable", this.#storageError.message);
    const status = this.getCloudStatus();
    const code = status === "restricted" ? "restricted" :
      status === "reconnect_required" || status === "signed_out" ? "reconnect_required" : "unavailable";
    return new CloudAccessError(code, cloudStatusMessage(status === "offline" ? "offline" : code));
  }

  async getRequestSession(callerToken: string): Promise<AuthRequestSession> {
    await this.initialize();
    this.#synchronizeForRequest();
    if (!this.#session || !this.#tokenBelongsToSession(callerToken, this.#session)) {
      throw new CloudAccessError("reconnect_required", "The account changed. Please try again.");
    }
    const request = this.#requestSession();
    if (!navigator.onLine || this.#cloudStatus === "restricted" || this.#cloudStatus === "reconnect_required") {
      throw this.#cloudRequestError();
    }
    try {
      if (this.#cloudStatus === "unavailable" || this.#session.expires_at * 1000 - Date.now() <= REFRESH_MARGIN_MS) {
        await this.#refreshSession(this.#cloudStatus === "unavailable");
      }
    } catch {
      this.#assertRequestCurrent(request);
      throw this.#cloudRequestError();
    }
    this.#assertRequestCurrent(request);
    return this.#requestSession();
  }

  async refreshRequestSession(request: AuthRequestSession): Promise<AuthRequestSession> {
    this.#synchronizeForRequest();
    this.#assertRequestCurrent(request);
    const session = this.#session;
    if (!session || !navigator.onLine || this.#cloudStatus === "restricted" || this.#cloudStatus === "reconnect_required") {
      throw this.#cloudRequestError();
    }
    try {
      // Another request or tab may already have replaced the rejected token.
      if (session.access_token === request.accessToken ||
        session.expires_at * 1000 - Date.now() <= REFRESH_MARGIN_MS) {
        await this.#refreshSession(session.access_token === request.accessToken);
      }
    } catch {
      this.#assertRequestCurrent(request);
      throw this.#cloudRequestError();
    }
    this.#assertRequestCurrent(request);
    return this.#requestSession();
  }

  #migrateLegacyStorage(): void {
    let hasPkce = readStorageItem(PKCE_STORAGE_KEY) !== null;
    if (!hasPkce) {
      const legacyVerifier = decodeLegacyCookie(`${LEGACY_STORAGE_KEY}-code-verifier`);
      if (typeof legacyVerifier === "string") {
        const [verifier, redirectType] = legacyVerifier.split("/");
        if (verifier && /^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
          writeStorageItem(
            PKCE_STORAGE_KEY,
            JSON.stringify({
              verifier,
              redirectType: redirectType === "recovery" ? "recovery" : "sign-in",
            } satisfies StoredPkce),
          );
          hasPkce = true;
        }
      }
    }
    if (hasPkce) clearLegacyCookie(`${LEGACY_STORAGE_KEY}-code-verifier`);

    let hasSession = readStorageItem(SESSION_STORAGE_KEY) !== null;
    if (!hasSession) {
      const legacySession = mapStoredSession(decodeLegacyCookie(LEGACY_STORAGE_KEY));
      if (legacySession) {
        writeStorageItem(SESSION_STORAGE_KEY, JSON.stringify(legacySession));
        hasSession = true;
      }
    }
    if (hasSession) clearLegacyCookie(LEGACY_STORAGE_KEY);
  }

  #removeCallbackParameters(): void {
    const url = withoutAuthCallback(new URL(window.location.href));
    window.history.replaceState(window.history.state, "", url.toString());
  }

  getCallbackFailure(): AuthCallbackFailure | null {
    return this.#callbackFailure;
  }

  #isPkceCurrent(pkce: StoredPkce): boolean {
    // Legacy callbacks remain compatible until this browser explicitly changes
    // its local-account epoch. New flows bind even an anonymous start (null).
    if (pkce.localAccountEpoch === undefined) return this.#readLocalAccountMarker() === null;
    return pkce.localAccountEpoch === this.#readLocalAccountEpoch();
  }

  async #exchangeCallbackCode(code: string): Promise<AuthSession> {
    const generation = this.#generation;
    const pkce = readStoredPkce();
    if (!pkce || !this.#isPkceCurrent(pkce)) {
      this.#callbackFailure = "missing_state";
      throw new AuthRequestError("The sign-in link is invalid or has expired.");
    }
    let session: AuthSession | null = null;
    try {
      const value = await this.#request("/v1/auth/session/exchange", "POST", {
        authCode: code,
        codeVerifier: pkce.verifier,
      });
      session =
        isRecord(value) && isRecord(value.data)
          ? mapApiSession(value.data.session)
          : null;
      if (!session) throw new AuthRequestError("Authentication is temporarily unavailable.");
      if (generation !== this.#generation || !this.#isPkceCurrent(pkce) || readStoredPkce()?.verifier !== pkce.verifier) throw new Error("Sign-in was cancelled.");
      this.#saveSession(
        session,
        pkce.redirectType === "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN",
      );
      return session;
    } catch (error) {
      // A rejected old code must not destroy the verifier for the latest link.
      this.#callbackFailure = error instanceof AuthStorageError ? "storage_unavailable"
        : error instanceof AuthRequestError ? (isDefinitiveClientError(error) && error.status !== 429 ? "invalid_link" : "temporarily_unavailable")
          : "account_changed";
      throw error;
    } finally {
      // A profile-write failure can leave the credential safely persisted. Do
      // not exchange its already-consumed code again when storage recovers.
      if (session && this.#session?.access_token === session.access_token) {
        this.#removeCallbackParameters();
        if (readStoredPkce()?.verifier === pkce.verifier) removeStorageItem(PKCE_STORAGE_KEY);
      }
    }
  }

  async #initializeOnce(): Promise<AuthResult<{ session: AuthSession | null }>> {
    if (this.#localAccountState !== "active") {
      return { data: { session: null }, error: this.#initializationError };
    }
    const callbackUrl = new URL(window.location.href);
    const isCallback = hasAuthCallback(callbackUrl);
    this.#callbackFailure = null;
    try {
      this.#storageError = null;
      this.#migrateLegacyStorage();
      this.getLocalUser();
      if (this.#storageError) throw this.#storageError;
      const signedOut = this.#readLocalAccountMarker()?.signedOut && !this.#pendingLocalAccountActivation;
      if (!signedOut) {
        this.#session = this.#readStoredSession();
        if (this.#session) this.#rememberAccessToken(this.#session.access_token);
        if (this.#session && !this.#localUser) {
          this.#localUser = this.#session.user;
          this.#cloudStatus = "available";
          this.#persistLocalProfile();
        } else if (this.#session && this.#session.user.id !== this.#localUser?.id) {
          this.#session = null;
          this.#cloudStatus = "reconnect_required";
        } else if (this.#localUser && this.#cloudStatus === "signed_out") {
          this.#cloudStatus = this.#session ? "available" : "reconnect_required";
        }
      }
      this.#synchronizeStoredSession();
      if (this.isLocalAccountInvalidated()) {
        return { data: { session: null }, error: this.#initializationError };
      }
      const callbackFailure = readAuthCallbackFailure(callbackUrl);
      if (callbackFailure) {
        this.#callbackFailure = callbackFailure;
        throw new AuthRequestError("Sign-in could not be completed. Please try again.");
      }
      const code = callbackUrl.searchParams.get("code");
      if (code) {
        const session = await this.#exchangeCallbackCode(code);
        return { data: { session }, error: null };
      }
      if (signedOut) return { data: { session: null }, error: null };

      const recovering = this.#cloudStatus === "unavailable" ||
        (this.#cloudStatus === "reconnect_required" && !this.#refreshRejected);
      if (this.#session && (recovering || this.#session.expires_at * 1000 <= Date.now()) && navigator.onLine &&
        this.#cloudStatus !== "restricted" && !this.#refreshRejected) {
        try {
          // Older clients persisted ordinary access-token 401s as reconnects.
          // Only a rejected refresh credential is proof that sign-in is needed.
          await this.#refreshSession(recovering);
        } catch (error) {
          if (!isExpiredSessionError(error)) {
            this.#notify("INITIAL_SESSION", this.#session);
            return {
              data: { session: this.#session },
              error: error instanceof Error ? error : new Error("Authentication failed."),
            };
          }

          this.#notify("SESSION_STALE", this.#session);
          return {
            data: { session: this.#session },
            error: error instanceof Error ? error : new Error("Session expired."),
          };
        }
      } else if (this.#session) {
        this.#scheduleRefresh();
      }
      this.#notify("INITIAL_SESSION", this.#session);
      return { data: { session: this.#session }, error: null };
    } catch (error) {
      if (error instanceof AuthStorageError) this.#recordStorageFailure(error);
      if (isCallback) {
        this.#callbackFailure ??= error instanceof AuthStorageError ? "storage_unavailable" : "account_changed";
        if (!["temporarily_unavailable", "storage_unavailable"].includes(this.#callbackFailure)) this.#removeCallbackParameters();
      }
      return {
        data: { session: this.#session },
        error: error instanceof Error ? error : new Error("Authentication failed."),
      };
    }
  }

  initialize(): Promise<AuthResult<{ session: AuthSession | null }>> {
    if (this.#initialization) return this.#initialization;
    const generation = this.#generation;
    const initialization = this.#initializeOnce().then((result) => {
      if (generation === this.#generation) this.#initializationError = result.error;
      if (result.error instanceof AuthStorageError && this.#initialization === initialization) {
        this.#initialization = null;
      }
      return { data: { session: this.#session }, error: this.#initializationError };
    });
    this.#initialization = initialization;
    return initialization;
  }

  async getSession(): Promise<AuthResult<{ session: AuthSession | null }>> {
    try {
      await this.initialize();
      this.#synchronizeStoredSession();
      if (this.#session && navigator.onLine && this.#cloudStatus === "available" &&
        this.#session.expires_at * 1000 - Date.now() <= REFRESH_MARGIN_MS) {
        await this.#refreshSession().catch(() => undefined);
      }
    } catch (error) {
      if (error instanceof AuthStorageError) this.#recordStorageFailure(error);
      else this.#initializationError = new Error("Authentication is temporarily unavailable.");
    }
    return { data: { session: this.#session }, error: this.#initializationError };
  }

  onAuthStateChange(callback: AuthChangeCallback) {
    this.#subscribers.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => this.#subscribers.delete(callback),
        },
      },
    };
  }

  async #storePkce(redirectType: StoredPkce["redirectType"]) {
    this.#synchronizeStoredSession();
    if (this.#disposed || this.#localAccountState === "invalidated") throw new Error(LOCAL_ACCOUNT_CHANGED_MESSAGE);
    const generation = this.#generation;
    const localAccountEpoch = this.#readLocalAccountEpoch();
    const pkce = await createPkce();
    const stored: StoredPkce = { verifier: pkce.verifier, redirectType, localAccountEpoch };
    if (generation !== this.#generation || !this.#isPkceCurrent(stored)) throw new Error("Sign-in was cancelled.");
    writeStorageItem(
      PKCE_STORAGE_KEY,
      JSON.stringify(stored),
    );
    return pkce;
  }

  async signInWithOAuth({
    provider,
    options,
  }: {
    provider: OAuthProvider;
    options: { redirectTo: string };
  }): Promise<AuthResult<{ url: string | null }>> {
    let pkceStored = false;
    try {
      const redirectTarget = readRedirectTarget(options.redirectTo, this.#dashboardUrl);
      if (!redirectTarget) throw new Error("The sign-in destination is invalid.");
      const { challenge } = await this.#storePkce("sign-in");
      pkceStored = true;
      const url = new URL(`${this.#authUrl}/auth/v1/authorize`);
      url.search = new URLSearchParams({
        provider,
        redirect_to: new URL(redirectTarget, `${this.#dashboardUrl}/`).toString(),
        code_challenge: challenge,
        code_challenge_method: "s256",
      }).toString();
      this.#navigate(url.toString());
      return { data: { url: url.toString() }, error: null };
    } catch (error) {
      if (pkceStored) removeStorageItem(PKCE_STORAGE_KEY);
      return {
        data: { url: null },
        error: error instanceof Error ? error : new Error(`Could not connect to ${provider === "apple" ? "Apple" : "Google"}.`),
      };
    }
  }

  async signInWithPassword({
    email,
    password,
    options,
  }: {
    email: string;
    password: string;
    options: { captchaToken: string };
  }): Promise<AuthResult<{ user: AuthUser | null; session: AuthSession | null }>> {
    const generation = this.#generation;
    try {
      const value = await this.#request("/v1/auth/sign-in/password", "POST", {
        email,
        password,
        captchaToken: options.captchaToken,
      });
      const session =
        isRecord(value) && isRecord(value.data)
          ? mapApiSession(value.data.session, true)
          : null;
      if (!session) throw new AuthRequestError("Authentication is temporarily unavailable.");
      if (generation !== this.#generation) throw new Error("Sign-in was cancelled.");
      this.#saveSession(session, "SIGNED_IN");
      return { data: { user: session.user, session }, error: null };
    } catch (error) {
      return {
        data: { user: null, session: null },
        error: error instanceof Error ? error : new Error("Sign-in failed."),
      };
    }
  }

  async signUp({
    email,
    password,
    options,
  }: {
    email: string;
    password: string;
    options: {
      captchaToken: string;
      emailRedirectTo: string;
      data?: { first_name?: string; last_name?: string };
    };
  }): Promise<AuthResult<{ user: AuthUser | null; session: AuthSession | null }>> {
    const generation = this.#generation;
    let attemptVerifier: string | null = null;
    try {
      const localUser = this.getLocalUser();
      const mergeIntent = readLocalVaultCloudMerge();
      if (
        localUser &&
        (!localUser.local_only || mergeIntent?.sourceVaultId !== localUser.id)
      ) {
        throw new Error("Reconnect to your existing account. To create another account, use a separate browser profile or explicitly sign out first.");
      }
      const redirectTarget = readRedirectTarget(
        options.emailRedirectTo,
        this.#dashboardUrl,
      );
      if (!redirectTarget) throw new Error("The confirmation destination is invalid.");
      const { challenge, verifier } = await this.#storePkce("sign-in");
      attemptVerifier = verifier;
      const firstName = options.data?.first_name?.trim();
      const lastName = options.data?.last_name?.trim();
      const value = await this.#request("/v1/auth/sign-up", "POST", {
        email,
        password,
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        captchaToken: options.captchaToken,
        pkceCodeChallenge: challenge,
        pkceCodeChallengeMethod: "s256",
        redirectTarget,
      });
      const data = isRecord(value) && isRecord(value.data) ? value.data : null;
      const session = data ? mapApiSession(data.session, true) : null;
      if (!data || (data.confirmationRequired === true ? data.session !== null : data.confirmationRequired !== false || !session)) {
        throw new AuthRequestError("Authentication is temporarily unavailable.");
      }
      const pendingPkce = readStoredPkce();
      if (generation !== this.#generation || !pendingPkce || pendingPkce.verifier !== attemptVerifier || !this.#isPkceCurrent(pendingPkce)) throw new Error("Sign-up was cancelled.");
      if (session) {
        removeStorageItem(PKCE_STORAGE_KEY);
        this.#saveSession(session, "SIGNED_IN");
      }
      return { data: { user: session?.user ?? null, session }, error: null };
    } catch (error) {
      if (attemptVerifier && isDefinitiveClientError(error)) {
        try {
          if (readStoredPkce()?.verifier === attemptVerifier) removeStorageItem(PKCE_STORAGE_KEY);
        } catch {
          // Storage failure must not turn a rejected signup into success.
        }
      }
      return {
        data: { user: null, session: null },
        error: error instanceof Error ? error : new Error("Sign-up failed."),
      };
    }
  }

  async resend({
    type,
    email,
    options,
  }: {
    type: "signup";
    email: string;
    options: { captchaToken: string; emailRedirectTo: string };
  }): Promise<AuthResult<Record<string, never>>> {
    let attemptVerifier: string | null = null;
    let previousPkce: StoredPkce | null = null;
    try {
      if (type !== "signup") throw new Error("Unsupported resend request.");
      const redirectTarget = readRedirectTarget(
        options.emailRedirectTo,
        this.#dashboardUrl,
      );
      if (!redirectTarget) throw new Error("The confirmation destination is invalid.");
      previousPkce = readStoredPkce();
      const { challenge, verifier } = await this.#storePkce("sign-in");
      attemptVerifier = verifier;
      await this.#request("/v1/auth/sign-up/resend", "POST", {
        email,
        captchaToken: options.captchaToken,
        pkceCodeChallenge: challenge,
        pkceCodeChallengeMethod: "s256",
        redirectTarget,
      });
      return { data: {}, error: null };
    } catch (error) {
      if (attemptVerifier && isDefinitiveClientError(error)) {
        try {
          if (readStoredPkce()?.verifier === attemptVerifier) {
            if (previousPkce && this.#isPkceCurrent(previousPkce)) writeStorageItem(PKCE_STORAGE_KEY, JSON.stringify(previousPkce));
            else removeStorageItem(PKCE_STORAGE_KEY);
          }
        } catch {
          // Keep the original request error; a later attempt checks storage again.
        }
      }
      return {
        data: {},
        error: error instanceof Error ? error : new Error("Resend failed."),
      };
    }
  }

  async resetPasswordForEmail(
    email: string,
    options: { redirectTo: string; captchaToken: string },
  ): Promise<AuthResult<Record<string, never>>> {
    let pkceStored = false;
    try {
      if (
        readRedirectTarget(options.redirectTo, this.#dashboardUrl) !==
        "/reset-password"
      ) {
        throw new Error("The password reset destination is invalid.");
      }
      const { challenge } = await this.#storePkce("recovery");
      pkceStored = true;
      await this.#request("/v1/auth/password/reset", "POST", {
        email,
        captchaToken: options.captchaToken,
        pkceCodeChallenge: challenge,
        pkceCodeChallengeMethod: "s256",
      });
      return { data: {}, error: null };
    } catch (error) {
      if (pkceStored && isDefinitiveClientError(error)) {
        removeStorageItem(PKCE_STORAGE_KEY);
      }
      return {
        data: {},
        error: error instanceof Error ? error : new Error("Password reset failed."),
      };
    }
  }

  async updateUser({
    password,
    current_password: currentPassword,
    data,
  }: {
    password: string;
    current_password?: string;
    data?: { password_sign_in_enabled?: boolean };
  }): Promise<AuthResult<{ user: AuthUser | null }>> {
    const generation = this.#generation;
    const initialized = await this.getSession();
    const session = initialized.data.session;
    if (!session) {
      return { data: { user: null }, error: new Error("Please sign in again.") };
    }
    try {
      const value = await this.#request(
        "/v1/auth/session/password",
        "PATCH",
        {
          password,
          ...(currentPassword ? { currentPassword } : {}),
          enablePasswordSignIn: data?.password_sign_in_enabled === true,
        },
        session.access_token,
      );
      const user =
        isRecord(value) && isRecord(value.data)
          ? mapUser(value.data.user, data?.password_sign_in_enabled === true)
          : null;
      if (!user) throw new AuthRequestError("Authentication is temporarily unavailable.");
      if (generation !== this.#generation || this.#session?.user.id !== user.id) throw new Error("The account changed. Please try again.");
      const nextSession = { ...this.#session, user };
      this.#saveSession(nextSession, "USER_UPDATED");
      return { data: { user }, error: null };
    } catch (error) {
      return {
        data: { user: null },
        error: error instanceof Error ? error : new Error("Password update failed."),
      };
    }
  }

  async #performRefresh(force: boolean, attempt: RefreshAttempt): Promise<AuthSession> {
    this.#synchronizeStoredSession();
    if (attempt.generation !== this.#generation) {
      const replacement = this.#replacementSession(attempt);
      if (replacement) return replacement;
      throw new Error("The account changed. Please try again.");
    }
    const current = this.#readStoredSession();
    if (!current) {
      this.#synchronizeStoredSession();
      throw new AuthRequestError("Your session has expired.", 401);
    }
    if (current.user.id !== this.getLocalUser()?.id || current.user.id !== attempt.session.user.id) {
      throw new Error("The account changed. Please try again.");
    }
    if (current.refresh_token !== attempt.session.refresh_token) {
      this.#adoptSession(current);
      if (current.expires_at * 1000 - Date.now() > REFRESH_MARGIN_MS) return current;
    }
    const currentAttempt = { session: current, generation: this.#generation };
    if (!force && current.expires_at * 1000 - Date.now() > REFRESH_MARGIN_MS) {
      this.#session = current;
      this.#rememberAccessToken(current.access_token);
      this.#scheduleRefresh();
      return current;
    }
    let rotatedSession: AuthSession | null = null;
    try {
      const value = await this.#request("/v1/auth/session/refresh", "POST", {
        refreshToken: current.refresh_token,
      });
      const session = isRecord(value) && isRecord(value.data) ? mapApiSession(value.data.session) : null;
      if (!session || session.user.id !== current.user.id || session.expires_at * 1000 <= Date.now()) {
        throw new AuthRequestError("Authentication is temporarily unavailable.");
      }
      rotatedSession = session;
      const latest = this.#readStoredSession();
      if (currentAttempt.generation !== this.#generation || !latest || latest.refresh_token !== current.refresh_token) {
        const replacement = this.#replacementSession(currentAttempt);
        if (replacement) return replacement;
        throw new Error("The account changed. Please try again.");
      }
      this.#saveSession(session, "TOKEN_REFRESHED");
      return session;
    } catch (error) {
      if (error instanceof AuthStorageError && rotatedSession && currentAttempt.generation === this.#generation &&
        this.#session?.refresh_token === current.refresh_token) {
        this.#pendingRotation = { ...currentAttempt, replacement: rotatedSession, epoch: this.#localAccountEpoch };
      }
      const replacement = this.#replacementSession(currentAttempt);
      if (replacement) return replacement;
      // Record against the credential that actually failed, before returning
      // through any more promise boundaries that could contain a new login.
      this.#recordRefreshFailure(error, currentAttempt);
      throw error;
    }
  }

  async #refreshSession(force = false): Promise<AuthSession> {
    if (this.#refreshPromise) return this.#refreshPromise;
    if (!this.#session || this.#disposed) throw new Error("The account changed. Please try again.");
    const attempt = { session: this.#session, generation: this.#generation };
    const refresh = (async () => {
      if (navigator.locks) {
        const controller = new AbortController();
        this.#refreshLockAbort = controller;
        let acquired = false;
        const timeoutId = window.setTimeout(() => controller.abort(), REFRESH_LOCK_TIMEOUT_MS);
        try {
          return await navigator.locks.request(
            "favlock-auth-refresh",
            { mode: "exclusive", signal: controller.signal },
            () => {
              acquired = true;
              window.clearTimeout(timeoutId);
              if (this.#refreshLockAbort === controller) this.#refreshLockAbort = null;
              return this.#performRefresh(force, attempt);
            },
          );
        } catch (error) {
          if (!acquired && attempt.generation === this.#generation) {
            const failure = new AuthRequestError("Authentication is temporarily unavailable.");
            this.#recordRefreshFailure(failure, attempt);
            throw failure;
          }
          throw error;
        } finally {
          window.clearTimeout(timeoutId);
          if (this.#refreshLockAbort === controller) this.#refreshLockAbort = null;
        }
      }
      return this.#performRefresh(force, attempt);
    })().catch((error: unknown) => {
      const replacement = this.#replacementSession(attempt);
      if (replacement) return replacement;
      if (error instanceof AuthStorageError) this.#recordStorageFailure(error);
      throw error;
    }).finally(() => {
      if (this.#refreshPromise === refresh) this.#refreshPromise = null;
    });
    this.#refreshPromise = refresh;
    return refresh;
  }

  #scheduleRefresh(): void {
    if (this.#refreshTimer !== null) window.clearTimeout(this.#refreshTimer);
    this.#refreshTimer = null;
    if (!this.#session || this.#disposed || !navigator.onLine ||
      this.#cloudStatus === "restricted" || this.#cloudStatus === "reconnect_required") return;
    const recovering = this.#storageError !== null || this.#cloudStatus === "unavailable";
    const delay = recovering ? REFRESH_RETRY_MS : Math.max(
      1_000,
      this.#session.expires_at * 1000 - Date.now() - REFRESH_MARGIN_MS,
    );
    this.#refreshTimer = window.setTimeout(() => {
      this.#refreshTimer = null;
      void this.#resumeSession().catch(() => undefined);
    }, delay);
  }

  async signOut(): Promise<AuthResult<Record<string, never>>> {
    let error: Error | null = null;
    try { this.#synchronizeStoredSession(); }
    catch (value) { error = value instanceof AuthStorageError ? value : new Error("Sign-out failed."); }
    if (this.#localAccountState === "invalidated") {
      return { data: {}, error: new Error(LOCAL_ACCOUNT_CHANGED_MESSAGE) };
    }
    // Detach immediately, before waiting for an online logout or pending refresh.
    let session = this.#session;
    if (!session && !error) {
      try { session = this.#readStoredSession(); }
      catch { error = new AuthStorageError(); }
    }
    this.#advanceGeneration();
    this.#localAccountState = "signed_out";
    this.#localUser = null;
    this.#cloudStatus = "signed_out";
    this.#refreshRejected = false;
    this.#profileNeedsRepair = false;
    this.#pendingLocalAccountActivation = false;
    this.#storageError = null;
    const epoch = crypto.randomUUID();
    this.#localAccountEpoch = epoch;
    for (const operation of [
      () => writeStorageItem(LOCAL_ACCOUNT_EPOCH_STORAGE_KEY, JSON.stringify({ id: epoch, signedOut: true } satisfies LocalAccountMarker)),
      () => removeStorageItem(LOCAL_PROFILE_STORAGE_KEY),
      () => removeStorageItem(PKCE_STORAGE_KEY),
      () => clearLegacyCookie(LEGACY_STORAGE_KEY),
      () => this.#removeSession(),
    ]) {
      try { operation(); }
      catch { error = new AuthStorageError(); }
    }
    this.#initializationError = error;
    if (session) {
      try {
        await this.#request(
          "/v1/auth/session/logout",
          "POST",
          undefined,
          session.access_token,
        );
      } catch (value) {
        error ??= value instanceof Error ? value : new Error("Sign-out failed.");
      }
    }
    return { data: {}, error };
  }

  #handleStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== LOCAL_PROFILE_STORAGE_KEY &&
      event.key !== SESSION_STORAGE_KEY && event.key !== LOCAL_ACCOUNT_EPOCH_STORAGE_KEY) return;
    try {
      // Events can arrive long after logout/re-login. Reconcile the current
      // snapshot, including clear() events, without replaying old deletions.
      this.#synchronizeStoredSession();
      if (this.#localAccountState !== "active") return;
      if (event.key === LOCAL_PROFILE_STORAGE_KEY || event.key === null) {
        const profile = this.#readLocalProfile();
        if (profile && profile.user.id === this.#localUser?.id) {
          this.#cloudStatus = profile.cloudStatus;
          this.#refreshRejected = profile.refreshRejected;
          this.#scheduleRefresh();
          this.#notify("SESSION_STALE", this.#session);
        }
      }
    } catch (error) {
      if (error instanceof AuthStorageError) this.#recordStorageFailure(error);
    }
  };

  startCrossTabSynchronization(): () => void {
    this.#synchronizationCount += 1;
    if (this.#synchronizationCount === 1) {
      window.addEventListener("storage", this.#handleStorage);
      window.addEventListener("online", this.#handleConnectivity);
      window.addEventListener("offline", this.#handleConnectivity);
      window.addEventListener("focus", this.#handleResume);
      window.addEventListener("pageshow", this.#handleResume);
      document.addEventListener("visibilitychange", this.#handleResume);
      this.#stopCloudFailures = subscribeToCloudFailures(({ accessToken, status }) => this.markCloudFailure(accessToken, status));
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#synchronizationCount = Math.max(0, this.#synchronizationCount - 1);
      if (this.#synchronizationCount === 0) {
        window.removeEventListener("storage", this.#handleStorage);
        window.removeEventListener("online", this.#handleConnectivity);
        window.removeEventListener("offline", this.#handleConnectivity);
        window.removeEventListener("focus", this.#handleResume);
        window.removeEventListener("pageshow", this.#handleResume);
        document.removeEventListener("visibilitychange", this.#handleResume);
        this.#stopCloudFailures?.();
      }
    };
  }

  #handleConnectivity = () => {
    void this.#resumeSession().catch(() => undefined);
    this.#notify("SESSION_STALE", this.#session);
    if (!navigator.onLine) this.#scheduleRefresh();
  };

  #handleResume = () => {
    if (document.visibilityState === "visible") {
      void this.#resumeSession().catch(() => undefined);
    }
  };

  async #resumeSession(): Promise<void> {
    try {
      await this.initialize();
      if (this.#disposed) return;
      this.#synchronizeStoredSession();
      if (!this.#session || !navigator.onLine || this.#cloudStatus === "restricted" ||
        this.#cloudStatus === "reconnect_required") return;
      const recovering = this.#cloudStatus === "unavailable";
      if (recovering || this.#session.expires_at * 1000 - Date.now() <= REFRESH_MARGIN_MS) {
        await this.#refreshSession(recovering);
      } else {
        this.#scheduleRefresh();
      }
    } catch (error) {
      if (error instanceof AuthStorageError) this.#recordStorageFailure(error);
      throw error;
    }
  }

  dispose(): void {
    this.#disposed = true;
    this.#advanceGeneration();
    if (this.#refreshTimer !== null) window.clearTimeout(this.#refreshTimer);
    this.#refreshTimer = null;
    this.#synchronizationCount = 0;
    this.#subscribers.clear();
    window.removeEventListener("storage", this.#handleStorage);
    window.removeEventListener("online", this.#handleConnectivity);
    window.removeEventListener("offline", this.#handleConnectivity);
    window.removeEventListener("focus", this.#handleResume);
    window.removeEventListener("pageshow", this.#handleResume);
    document.removeEventListener("visibilitychange", this.#handleResume);
    this.#stopCloudFailures?.();
  }
}

export const favLockAuth = new FavLockAuthClient();
