import { API_URL, DASHBOARD_URL } from "./appUrls";
import { captureInitialPasswordRecoveryRedirect } from "./authRecovery";
import { readAuthUrl } from "./authUrl";
import { cloudStatusMessage, subscribeToCloudFailures, type CloudStatus } from "./cloudAccess";

const SESSION_STORAGE_KEY = "favlock.auth.session.v1";
export const LOCAL_PROFILE_STORAGE_KEY = "favlock.local-profile.v1";
const PKCE_STORAGE_KEY = "favlock.auth.pkce.v1";
const LEGACY_STORAGE_KEY = "sb-auth";
const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const REFRESH_MARGIN_MS = 60_000;
const REFRESH_RETRY_MS = 30_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: "bearer";
  user: AuthUser;
}

export type AuthChangeEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "SESSION_STALE"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY";

interface StoredPkce {
  verifier: string;
  redirectType: "sign-in" | "recovery";
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

  constructor(message: string, status = 0) {
    super(message);
    this.name = "AuthRequestError";
    this.status = status;
  }
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
  const email = readString(value.email, 254);
  const createdAt = readString(value.created_at, 64);
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
  };
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
  };
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
  try {
    const value = JSON.parse(localStorage.getItem(PKCE_STORAGE_KEY) ?? "null") as unknown;
    if (!isRecord(value)) return null;
    const verifier = readString(value.verifier, 128);
    const redirectType = value.redirectType;
    if (
      !verifier ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
      !["sign-in", "recovery"].includes(redirectType as string)
    ) {
      return null;
    }
    return { verifier, redirectType: redirectType as StoredPkce["redirectType"] };
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
  #cloudStatus: CloudStatus = "signed_out";
  #generation = 0;
  #stopCloudFailures: (() => void) | null = null;
  #initialization: Promise<AuthResult<{ session: AuthSession | null }>> | null = null;
  #initializationError: Error | null = null;
  #refreshPromise: Promise<AuthSession> | null = null;
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
      );
    }
    return value;
  }

  #notify(event: AuthChangeEvent, session: AuthSession | null): void {
    for (const subscriber of this.#subscribers) {
      queueMicrotask(() => void subscriber(event, session));
    }
  }

  #saveSession(session: AuthSession, event: AuthChangeEvent): void {
    const localUser = this.getLocalUser();
    if (localUser && localUser.id !== session.user.id) {
      throw new Error("This is a different account. Your local vault was not changed. Export it before explicitly signing out, or use a separate browser profile.");
    }
    this.#localUser = session.user;
    this.#cloudStatus = "available";
    this.#initializationError = null;
    this.#persistLocalProfile();
    this.#session = session;
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    this.#scheduleRefresh();
    this.#notify(event, session);
  }

  #removeSession(notify = true): void {
    this.#session = null;
    this.#initializationError = null;
    localStorage.removeItem(SESSION_STORAGE_KEY);
    if (this.#refreshTimer !== null) window.clearTimeout(this.#refreshTimer);
    this.#refreshTimer = null;
    if (notify) this.#notify("SIGNED_OUT", null);
  }

  #persistLocalProfile(): void {
    if (!this.#localUser) return;
    const user = this.#localUser;
    localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1,
      user: { id: user.id, email: user.email, created_at: user.created_at, user_metadata: {
        first_name: readString(user.user_metadata.first_name, 256) ?? "",
        last_name: readString(user.user_metadata.last_name, 256) ?? "",
        password_sign_in_enabled: user.user_metadata.password_sign_in_enabled === true,
      }, app_metadata: {
        provider: user.app_metadata.provider === "google" ? "google" : "email",
        providers: Array.isArray(user.app_metadata.providers) ? user.app_metadata.providers.filter((value) => value === "email" || value === "google") : [],
      }, identities: user.identities?.filter(({ provider }) => provider === "email" || provider === "google") },
      cloudStatus: this.#cloudStatus,
    }));
  }

  getLocalUser(): AuthUser | null {
    if (this.#localUser) return this.#localUser;
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY) ?? "null");
      if (isRecord(stored) && stored.version === 1) {
        this.#localUser = mapStoredUser(stored.user);
        if (stored.cloudStatus === "restricted" || stored.cloudStatus === "reconnect_required" || stored.cloudStatus === "available" || stored.cloudStatus === "unavailable") {
          this.#cloudStatus = stored.cloudStatus;
        }
      }
    } catch { /* A corrupt profile never authorizes cloud requests. */ }
    if (!this.#localUser) {
      const legacy = this.#readStoredSession();
      if (legacy) {
        this.#localUser = legacy.user;
        this.#cloudStatus = "available";
        this.#persistLocalProfile();
      }
    }
    return this.#localUser;
  }

  getCloudStatus(): CloudStatus {
    if (!this.getLocalUser()) return "signed_out";
    if (!navigator.onLine) return "offline";
    if (this.#cloudStatus === "available" && (!this.#session || this.#session.expires_at * 1000 <= Date.now())) {
      return "reconnect_required";
    }
    return this.#cloudStatus;
  }

  markCloudFailure(accessToken: string, status: "reconnect_required" | "restricted" | "unavailable"): void {
    if (accessToken !== this.#session?.access_token) return;
    // A late network error cannot restart automatic recovery after a denial.
    if ((this.#cloudStatus === "restricted" || this.#cloudStatus === "reconnect_required") && status === "unavailable") return;
    this.#cloudStatus = status;
    this.#persistLocalProfile();
    this.#scheduleRefresh();
    this.#notify("SESSION_STALE", this.#session);
  }

  async retryCloudConnection(): Promise<void> {
    await this.initialize();
    if (!navigator.onLine) throw new Error(cloudStatusMessage("offline"));
    if (!this.#session) throw new Error(cloudStatusMessage("reconnect_required"));
    try {
      const session = await this.#refreshSession(true);
      // Auth refresh does not prove data authorization. The next operation is
      // still checked by the server; restricted users cannot bypass it.
      this.#cloudStatus = "available";
      this.#persistLocalProfile();
      this.#scheduleRefresh();
      this.#notify("TOKEN_REFRESHED", session);
    } catch (error) {
      this.#recordRefreshFailure(error);
      throw error;
    }
  }

  #recordRefreshFailure(error: unknown): void {
    if (!this.#session) return;
    this.markCloudFailure(this.#session.access_token,
      error instanceof AuthRequestError && error.status === 403 ? "restricted" :
      isExpiredSessionError(error) ? "reconnect_required" : "unavailable");
  }

  #readStoredSession(): AuthSession | null {
    try {
      const session = mapStoredSession(
        JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "null") as unknown,
      );
      if (!session) localStorage.removeItem(SESSION_STORAGE_KEY);
      return session;
    } catch {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
  }

  #migrateLegacyStorage(): void {
    let hasPkce = localStorage.getItem(PKCE_STORAGE_KEY) !== null;
    if (!hasPkce) {
      const legacyVerifier = decodeLegacyCookie(`${LEGACY_STORAGE_KEY}-code-verifier`);
      if (typeof legacyVerifier === "string") {
        const [verifier, redirectType] = legacyVerifier.split("/");
        if (verifier && /^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
          localStorage.setItem(
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

    let hasSession = localStorage.getItem(SESSION_STORAGE_KEY) !== null;
    if (!hasSession) {
      const legacySession = mapStoredSession(decodeLegacyCookie(LEGACY_STORAGE_KEY));
      if (legacySession) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(legacySession));
        hasSession = true;
      }
    }
    if (hasSession) clearLegacyCookie(LEGACY_STORAGE_KEY);
  }

  #removeCallbackParameters(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("sb_flow_id");
    window.history.replaceState(window.history.state, "", url.toString());
  }

  async #exchangeCallbackCode(code: string): Promise<AuthSession> {
    const generation = this.#generation;
    const pkce = readStoredPkce();
    if (!pkce) throw new AuthRequestError("The sign-in link is invalid or has expired.");
    try {
      const value = await this.#request("/v1/auth/session/exchange", "POST", {
        authCode: code,
        codeVerifier: pkce.verifier,
      });
      const session =
        isRecord(value) && isRecord(value.data)
          ? mapApiSession(value.data.session)
          : null;
      if (!session) throw new AuthRequestError("Authentication is temporarily unavailable.");
      if (generation !== this.#generation) throw new Error("Sign-in was cancelled.");
      localStorage.removeItem(PKCE_STORAGE_KEY);
      this.#removeCallbackParameters();
      this.#saveSession(
        session,
        pkce.redirectType === "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN",
      );
      return session;
    } catch (error) {
      if (isDefinitiveClientError(error)) {
        localStorage.removeItem(PKCE_STORAGE_KEY);
      }
      throw error;
    }
  }

  async #initializeOnce(): Promise<AuthResult<{ session: AuthSession | null }>> {
    this.#migrateLegacyStorage();
    this.getLocalUser();
    this.#session = this.#readStoredSession();
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
    const code = new URL(window.location.href).searchParams.get("code");
    try {
      if (code) {
        const session = await this.#exchangeCallbackCode(code);
        return { data: { session }, error: null };
      }

      const recovering = this.#cloudStatus === "unavailable";
      if (this.#session && (recovering || this.#session.expires_at * 1000 <= Date.now()) && navigator.onLine &&
        this.#cloudStatus !== "restricted" && this.#cloudStatus !== "reconnect_required") {
        try {
          // A saved transient failure must be rechecked even before token expiry.
          this.#session = await this.#refreshSession(recovering);
        } catch (error) {
          this.#recordRefreshFailure(error);
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
      return {
        data: { session: this.#session },
        error: error instanceof Error ? error : new Error("Authentication failed."),
      };
    }
  }

  initialize(): Promise<AuthResult<{ session: AuthSession | null }>> {
    this.#initialization ??= this.#initializeOnce().then((result) => {
      this.#initializationError = result.error;
      return result;
    });
    return this.#initialization;
  }

  async getSession(): Promise<AuthResult<{ session: AuthSession | null }>> {
    await this.initialize();
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
    const pkce = await createPkce();
    localStorage.setItem(
      PKCE_STORAGE_KEY,
      JSON.stringify({ verifier: pkce.verifier, redirectType } satisfies StoredPkce),
    );
    return pkce;
  }

  async signInWithOAuth({
    provider,
    options,
  }: {
    provider: "google";
    options: { redirectTo: string };
  }): Promise<AuthResult<{ url: string | null }>> {
    let pkceStored = false;
    try {
      if (provider !== "google") throw new Error("Unsupported sign-in provider.");
      const redirectTarget = readRedirectTarget(options.redirectTo, this.#dashboardUrl);
      if (!redirectTarget) throw new Error("The sign-in destination is invalid.");
      const { challenge } = await this.#storePkce("sign-in");
      pkceStored = true;
      const url = new URL(`${this.#authUrl}/auth/v1/authorize`);
      url.search = new URLSearchParams({
        provider: "google",
        redirect_to: new URL(redirectTarget, `${this.#dashboardUrl}/`).toString(),
        code_challenge: challenge,
        code_challenge_method: "s256",
      }).toString();
      this.#navigate(url.toString());
      return { data: { url: url.toString() }, error: null };
    } catch (error) {
      if (pkceStored) localStorage.removeItem(PKCE_STORAGE_KEY);
      return {
        data: { url: null },
        error: error instanceof Error ? error : new Error("Could not connect to Google."),
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
      data: { first_name?: string; last_name?: string };
    };
  }): Promise<AuthResult<{ user: AuthUser | null; session: AuthSession | null }>> {
    const generation = this.#generation;
    let pkceStored = false;
    try {
      if (this.getLocalUser()) throw new Error("Reconnect to your existing account. To create another account, use a separate browser profile or explicitly sign out first.");
      const redirectTarget = readRedirectTarget(
        options.emailRedirectTo,
        this.#dashboardUrl,
      );
      if (!redirectTarget) throw new Error("The confirmation destination is invalid.");
      const { challenge } = await this.#storePkce("sign-in");
      pkceStored = true;
      const value = await this.#request("/v1/auth/sign-up", "POST", {
        email,
        password,
        firstName: options.data.first_name?.trim() ?? "",
        lastName: options.data.last_name?.trim() ?? "",
        captchaToken: options.captchaToken,
        pkceCodeChallenge: challenge,
        pkceCodeChallengeMethod: "s256",
        redirectTarget,
      });
      const data = isRecord(value) && isRecord(value.data) ? value.data : null;
      const session = data ? mapApiSession(data.session, true) : null;
      if (!data || (data.confirmationRequired !== true && !session)) {
        throw new AuthRequestError("Authentication is temporarily unavailable.");
      }
      if (session) {
        if (generation !== this.#generation) throw new Error("Sign-up was cancelled.");
        localStorage.removeItem(PKCE_STORAGE_KEY);
        this.#saveSession(session, "SIGNED_IN");
      }
      return { data: { user: session?.user ?? null, session }, error: null };
    } catch (error) {
      if (pkceStored && isDefinitiveClientError(error)) {
        localStorage.removeItem(PKCE_STORAGE_KEY);
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
    let pkceStored = false;
    try {
      if (type !== "signup") throw new Error("Unsupported resend request.");
      const redirectTarget = readRedirectTarget(
        options.emailRedirectTo,
        this.#dashboardUrl,
      );
      if (!redirectTarget) throw new Error("The confirmation destination is invalid.");
      const { challenge } = await this.#storePkce("sign-in");
      pkceStored = true;
      await this.#request("/v1/auth/sign-up/resend", "POST", {
        email,
        captchaToken: options.captchaToken,
        pkceCodeChallenge: challenge,
        pkceCodeChallengeMethod: "s256",
        redirectTarget,
      });
      return { data: {}, error: null };
    } catch (error) {
      if (pkceStored && isDefinitiveClientError(error)) {
        localStorage.removeItem(PKCE_STORAGE_KEY);
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
        localStorage.removeItem(PKCE_STORAGE_KEY);
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

  async #performRefresh(force = false): Promise<AuthSession> {
    const generation = this.#generation;
    const current = this.#readStoredSession();
    if (!current) throw new AuthRequestError("Your session has expired.", 401);
    if (current.user.id !== this.getLocalUser()?.id) throw new AuthRequestError("Reconnect to the original account.", 401);
    if (!force && current.expires_at * 1000 - Date.now() > REFRESH_MARGIN_MS) {
      this.#session = current;
      this.#scheduleRefresh();
      return current;
    }
    let value: unknown;
    try {
      value = await this.#request("/v1/auth/session/refresh", "POST", {
        refreshToken: current.refresh_token,
      });
    } catch (error) {
      if (isExpiredSessionError(error)) {
        const latest = this.#readStoredSession();
        if (
          generation === this.#generation && latest &&
          latest.user.id === current.user.id &&
          latest.refresh_token !== current.refresh_token &&
          latest.expires_at * 1000 > Date.now()
        ) {
          this.#saveSession(latest, "TOKEN_REFRESHED");
          return latest;
        }
      }
      throw error;
    }
    const session =
      isRecord(value) && isRecord(value.data)
        ? mapApiSession(value.data.session)
        : null;
    if (!session || session.user.id !== current.user.id) {
      throw new AuthRequestError("Your session has expired.", 401);
    }
    const latest = this.#readStoredSession();
    if (generation !== this.#generation) throw new AuthRequestError("Sign-in changed while refreshing. Reconnect to continue.", 401);
    if (!latest || latest.refresh_token !== current.refresh_token) {
      if (latest && latest.user.id === current.user.id && latest.expires_at * 1000 > Date.now()) {
        this.#saveSession(latest, "TOKEN_REFRESHED");
        return latest;
      }
      throw new AuthRequestError("Sign-in changed while refreshing. Reconnect to continue.", 401);
    }
    this.#saveSession(session, "TOKEN_REFRESHED");
    return session;
  }

  async #refreshSession(force = false): Promise<AuthSession> {
    if (this.#refreshPromise) return this.#refreshPromise;
    this.#refreshPromise = (async () => {
      if (navigator.locks) {
        return navigator.locks.request(
          "favlock-auth-refresh",
          { mode: "exclusive" },
          () => this.#performRefresh(force),
        );
      }
      return this.#performRefresh(force);
    })().finally(() => {
      this.#refreshPromise = null;
    });
    return this.#refreshPromise;
  }

  #scheduleRefresh(): void {
    if (this.#refreshTimer !== null) window.clearTimeout(this.#refreshTimer);
    this.#refreshTimer = null;
    if (!this.#session || this.#disposed || !navigator.onLine ||
      this.#cloudStatus === "restricted" || this.#cloudStatus === "reconnect_required") return;
    const recovering = this.#cloudStatus === "unavailable";
    const delay = recovering ? REFRESH_RETRY_MS : Math.max(
      1_000,
      this.#session.expires_at * 1000 - Date.now() - REFRESH_MARGIN_MS,
    );
    this.#refreshTimer = window.setTimeout(() => {
      this.#refreshTimer = null;
      void this.#refreshSession(recovering).catch((error: unknown) => {
        this.#recordRefreshFailure(error);
      });
    }, delay);
  }

  async signOut(): Promise<AuthResult<Record<string, never>>> {
    // Detach immediately, before waiting for an online logout or pending refresh.
    const session = this.#session ?? this.#readStoredSession();
    this.#generation += 1;
    this.#localUser = null;
    this.#cloudStatus = "signed_out";
    localStorage.removeItem(LOCAL_PROFILE_STORAGE_KEY);
    localStorage.removeItem(PKCE_STORAGE_KEY);
    clearLegacyCookie(LEGACY_STORAGE_KEY);
    this.#removeSession();
    let error: Error | null = null;
    if (session) {
      try {
        await this.#request(
          "/v1/auth/session/logout",
          "POST",
          undefined,
          session.access_token,
        );
      } catch (value) {
        error = value instanceof Error ? value : new Error("Sign-out failed.");
      }
    }
    return { data: {}, error };
  }

  #handleStorage = (event: StorageEvent) => {
    if (event.key === LOCAL_PROFILE_STORAGE_KEY && !event.newValue) {
      this.#generation += 1;
      this.#localUser = null;
      this.#cloudStatus = "signed_out";
      this.#removeSession();
      return;
    }
    if (event.key === LOCAL_PROFILE_STORAGE_KEY && event.newValue) {
      try {
        const value: unknown = JSON.parse(event.newValue);
        if (isRecord(value) && value.version === 1 && mapStoredUser(value.user)?.id === this.#localUser?.id &&
          (value.cloudStatus === "restricted" || value.cloudStatus === "reconnect_required" || value.cloudStatus === "unavailable" || value.cloudStatus === "available")) {
          this.#cloudStatus = value.cloudStatus;
          this.#scheduleRefresh();
          this.#notify("SESSION_STALE", this.#session);
        }
      } catch { /* Ignore malformed profile notifications. */ }
      return;
    }
    if (event.key !== SESSION_STORAGE_KEY) return;
    const previousUserId = this.#session?.user.id ?? null;
    let session: AuthSession | null = null;
    if (event.newValue) {
      try {
        session = mapStoredSession(JSON.parse(event.newValue) as unknown);
      } catch {
        session = null;
      }
      if (!session) localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    if (session && this.getLocalUser() && session.user.id !== this.getLocalUser()?.id) session = null;
    if (!session || session.user.id !== this.#session?.user.id) this.#generation += 1;
    this.#session = session;
    this.#cloudStatus = session ? "available" : "reconnect_required";
    this.#scheduleRefresh();
    if (!session) this.#notify("SESSION_STALE", null);
    else {
      this.#notify(
        previousUserId === session.user.id ? "TOKEN_REFRESHED" : "SIGNED_IN",
        session,
      );
    }
  };

  startCrossTabSynchronization(): () => void {
    this.#synchronizationCount += 1;
    if (this.#synchronizationCount === 1) {
      window.addEventListener("storage", this.#handleStorage);
      window.addEventListener("online", this.#handleConnectivity);
      window.addEventListener("offline", this.#handleConnectivity);
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
        this.#stopCloudFailures?.();
      }
    };
  }

  #handleConnectivity = () => {
    this.#notify("SESSION_STALE", this.#session);
    if (navigator.onLine && this.#cloudStatus !== "restricted" && this.#cloudStatus !== "reconnect_required") {
      void this.retryCloudConnection().catch(() => undefined);
    } else {
      this.#scheduleRefresh();
    }
  };

  dispose(): void {
    this.#disposed = true;
    if (this.#refreshTimer !== null) window.clearTimeout(this.#refreshTimer);
    this.#refreshTimer = null;
    this.#synchronizationCount = 0;
    this.#subscribers.clear();
    window.removeEventListener("storage", this.#handleStorage);
    window.removeEventListener("online", this.#handleConnectivity);
    window.removeEventListener("offline", this.#handleConnectivity);
    this.#stopCloudFailures?.();
  }
}

export const favLockAuth = new FavLockAuthClient();
