import {
  assertConfiguredExtensionId,
  FAVLOCK_CONFIG,
} from "./config.js";
import {
  deleteLibraryKey,
  importLibraryKey,
  loadLibraryKey,
  saveLibraryKey,
} from "./extension-crypto.js";

export const PAIR_KEY_MESSAGE = "favlock.extension.pair-key";
const SESSION_KEY = "favlockAuthSession";
const ORIGINAL_TAB_KEY = "favlockOriginalTabId";

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function createRandomUrlToken(byteLength = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function createPkceChallenge(verifier) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

export function buildGoogleAuthorizationUrl({
  redirectUri,
  state,
  codeChallenge,
}) {
  const redirectTarget = new URL(redirectUri);
  redirectTarget.searchParams.set("state", state);
  const authorizationUrl = new URL(
    `${FAVLOCK_CONFIG.authUrl}/auth/v1/authorize`,
  );
  authorizationUrl.search = new URLSearchParams({
    provider: "google",
    redirect_to: redirectTarget.toString(),
    code_challenge: codeChallenge,
    code_challenge_method: "s256",
  }).toString();
  return authorizationUrl;
}

function apiUrl(path) {
  return `${FAVLOCK_CONFIG.apiUrl}${path}`;
}

function readApiError(payload, fallback) {
  return typeof payload?.error?.message === "string"
    ? payload.error.message
    : fallback;
}

async function readJson(response, fallback) {
  try {
    return await response.json();
  } catch {
    throw new Error(fallback);
  }
}

async function requestSession(path, body, failureMessage) {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  const payload = await readJson(response, failureMessage);
  if (!response.ok) throw new Error(readApiError(payload, failureMessage));
  const session = payload?.data?.session;
  if (
    typeof session?.accessToken !== "string" ||
    !session.accessToken ||
    typeof session.refreshToken !== "string" ||
    !session.refreshToken ||
    !Number.isSafeInteger(session.expiresAt) ||
    session.expiresAt < 1 ||
    typeof session.user?.id !== "string"
  ) {
    throw new Error(failureMessage);
  }
  return session;
}

async function readSession() {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  return stored[SESSION_KEY] || null;
}

async function writeSession(session) {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

export async function requestUser(accessToken) {
  const response = await fetch(
    apiUrl("/v1/auth/session/user"),
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    },
  );
  if (!response.ok) throw new Error("FavLock could not verify this session.");
  const payload = await readJson(
    response,
    "FavLock could not verify this session.",
  );
  const user = payload?.data?.user;
  if (typeof user?.id !== "string") {
    throw new Error("FavLock could not verify this session.");
  }
  return user;
}

function createStoredSession(payload, user) {
  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresAt: Number(payload.expiresAt) * 1000,
    userId: user.id,
    email: user.email || "",
  };
}

export async function exchangeAuthorizationCode({ code, codeVerifier }) {
  const payload = await requestSession(
    "/v1/auth/session/exchange",
    { authCode: code, codeVerifier },
    "FavLock sign-in failed.",
  );
  const user = await requestUser(payload.accessToken);
  const session = createStoredSession(payload, user);
  await writeSession(session);
  return session;
}

export async function exchangeExtensionSessionToken({ tokenHash, expectedUserId }) {
  if (typeof tokenHash !== "string" || !tokenHash) {
    throw new Error("FavLock did not provide extension authorization.");
  }

  const payload = await requestSession(
    "/v1/auth/session/verify",
    { tokenHash },
    "FavLock extension authorization expired. Please try again.",
  );

  const user = payload.user;
  if (!user?.id || user.id !== expectedUserId) {
    throw new Error("The paired FavLock account does not match.");
  }

  const session = createStoredSession(payload, user);
  return session;
}

export async function refreshSession(session) {
  let payload;
  try {
    payload = await requestSession(
      "/v1/auth/session/refresh",
      { refreshToken: session.refreshToken },
      "Your FavLock session expired. Connect the extension again.",
    );
  } catch {
    await disconnectExtension();
    throw new Error("Your FavLock session expired. Connect the extension again.");
  }
  if (payload.user.id !== session.userId) {
    await disconnectExtension();
    throw new Error("Your FavLock session expired. Connect the extension again.");
  }
  const nextSession = {
    ...session,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresAt: Number(payload.expiresAt) * 1000,
  };
  await writeSession(nextSession);
  return nextSession;
}

export async function getValidSession() {
  const session = await readSession();
  if (!session) return null;
  if (session.expiresAt > Date.now() + 60_000) return session;
  return refreshSession(session);
}

async function focusOriginalTab() {
  const stored = await chrome.storage.session.get(ORIGINAL_TAB_KEY);
  const tabId = stored[ORIGINAL_TAB_KEY];
  if (Number.isInteger(tabId)) {
    try {
      await chrome.tabs.update(tabId, { active: true });
    } catch {
      // The original tab may have been closed while connecting.
    }
  }
  await chrome.storage.session.remove(ORIGINAL_TAB_KEY);
}

async function rememberOriginalTab() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (Number.isInteger(activeTab?.id)) {
    await chrome.storage.session.set({ [ORIGINAL_TAB_KEY]: activeTab.id });
  }
}

export function buildEmailAuthorizationUrl({ dashboardUrl, extensionId }) {
  const pairPath = new URL("extension/pair", dashboardUrl);
  pairPath.searchParams.set("extensionId", extensionId);
  pairPath.searchParams.set("auth", "email");

  const loginUrl = new URL("login", dashboardUrl);
  loginUrl.searchParams.set(
    "next",
    `${pairPath.pathname}${pairPath.search}`,
  );
  return loginUrl;
}

export async function beginEmailExtensionConnection() {
  assertConfiguredExtensionId();
  await rememberOriginalTab();
  const loginUrl = buildEmailAuthorizationUrl({
    dashboardUrl: FAVLOCK_CONFIG.dashboardUrl,
    extensionId: chrome.runtime.id,
  });
  await chrome.tabs.create({ url: loginUrl.toString() });
  return { needsKey: true };
}

export async function beginExtensionConnection() {
  assertConfiguredExtensionId();
  await rememberOriginalTab();

  const redirectUri = chrome.identity.getRedirectURL("favlock");
  const codeVerifier = createRandomUrlToken(48);
  const codeChallenge = await createPkceChallenge(codeVerifier);
  const state = createRandomUrlToken();
  const authorizationUrl = buildGoogleAuthorizationUrl({
    redirectUri,
    state,
    codeChallenge,
  });

  const callbackUrl = await chrome.identity.launchWebAuthFlow({
    url: authorizationUrl.toString(),
    interactive: true,
  });
  if (!callbackUrl) throw new Error("FavLock sign-in was cancelled.");
  const callback = new URL(callbackUrl);
  const expectedCallback = new URL(redirectUri);
  if (
    callback.origin !== expectedCallback.origin ||
    callback.pathname !== expectedCallback.pathname
  ) {
    throw new Error("FavLock rejected an unexpected sign-in callback.");
  }
  if (callback.searchParams.get("state") !== state) {
    throw new Error("FavLock rejected an invalid sign-in response.");
  }
  const oauthError = callback.searchParams.get("error_description");
  if (oauthError) throw new Error(oauthError);
  const code = callback.searchParams.get("code");
  if (!code) throw new Error("FavLock did not return an authorization code.");

  await exchangeAuthorizationCode({ code, codeVerifier });
  if (!(await loadLibraryKey())) {
    const pairUrl = new URL("extension/pair", FAVLOCK_CONFIG.dashboardUrl);
    pairUrl.searchParams.set("extensionId", chrome.runtime.id);
    await chrome.tabs.create({ url: pairUrl.toString() });
    return { needsKey: true };
  }
  await focusOriginalTab();
  return { needsKey: false };
}

export async function receivePairedKey(message, sender) {
  if (message?.type !== PAIR_KEY_MESSAGE) return null;
  let senderOrigin = sender.origin;
  if (!senderOrigin && sender.url) {
    try {
      senderOrigin = new URL(sender.url).origin;
    } catch {
      senderOrigin = null;
    }
  }
  if (senderOrigin !== new URL(FAVLOCK_CONFIG.dashboardUrl).origin) {
    return { ok: false, error: "Untrusted pairing origin." };
  }
  try {
    let session = null;
    try {
      session = await getValidSession();
    } catch {
      session = null;
    }
    let replacingSession = false;
    if (!session || session.userId !== message.userId) {
      session = await exchangeExtensionSessionToken({
        tokenHash: message.sessionTokenHash,
        expectedUserId: message.userId,
      });
      replacingSession = true;
    }
    if (session.userId !== message.userId) {
      throw new Error("The paired FavLock account does not match.");
    }

    const key = await importLibraryKey(message.rawKey);
    if (replacingSession) {
      await deleteLibraryKey();
      await writeSession(session);
    }
    await saveLibraryKey(key);
    if (Number.isInteger(sender.tab?.id)) {
      const pairingTabId = sender.tab.id;
      setTimeout(() => {
        void chrome.tabs
          .remove(pairingTabId)
          .catch(() => undefined)
          .then(focusOriginalTab);
      }, 200);
    } else {
      await focusOriginalTab();
    }
    await chrome.action.setBadgeBackgroundColor({ color: "#15803d" });
    await chrome.action.setBadgeText({ text: "✓" });
    setTimeout(() => {
      const developmentBuild = FAVLOCK_CONFIG.target === "development";
      void chrome.action.setBadgeBackgroundColor({
        color: developmentBuild ? "#b45309" : "#15803d",
      });
      void chrome.action.setBadgeText({ text: developmentBuild ? "DEV" : "" });
    }, 2500);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid encryption key.",
    };
  }
}

export async function getConnectionState() {
  let session = null;
  try {
    session = await getValidSession();
  } catch {
    session = null;
  }
  return {
    connected: !!session,
    unlocked: !!(await loadLibraryKey()),
    email: session?.email || "",
  };
}

export async function disconnectExtension() {
  await Promise.all([
    chrome.storage.local.remove(SESSION_KEY),
    chrome.storage.session.remove(ORIGINAL_TAB_KEY),
    deleteLibraryKey(),
  ]);
}
