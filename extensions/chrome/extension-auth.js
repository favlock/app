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
import {
  LOCAL_PROJECTION_KEY,
  LOCAL_PROJECTION_MESSAGE,
  normalizeLocalProjection,
  removeLocalProjection,
  writeLocalProjection,
} from "./local-projection.js";

export const PAIR_KEY_MESSAGE = "favlock.extension.pair-key";
export const ONBOARDING_STATUS_MESSAGE = "favlock.extension.onboarding-status";
const SESSION_KEY = "favlockAuthSession";
const PROFILE_KEY = "favlockLocalProfile";
const EPOCH_KEY = "favlockLocalEpoch";
const ORIGINAL_TAB_KEY = "favlockOriginalTabId";
const PAIRING_ATTEMPT_KEY = "favlockPairingAttempt";
const PAIRING_ATTEMPT_TTL_MS = 10 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let refreshPromise = null;
let stateQueue = Promise.resolve();

function withStateLock(work) {
  if (globalThis.navigator?.locks) return navigator.locks.request("favlock-extension-state", work);
  const next = stateQueue.catch(() => undefined).then(work);
  stateQueue = next.catch(() => undefined);
  return next;
}

function validSession(session) {
  return session && typeof session.accessToken === "string" && session.accessToken.length > 0 && session.accessToken.length <= 16384 &&
    typeof session.refreshToken === "string" && session.refreshToken.length > 0 && session.refreshToken.length <= 16384 &&
    Number.isSafeInteger(session.expiresAt) && session.expiresAt > 0 && UUID.test(session.userId);
}

export async function readLocalAccount() {
  const stored = await chrome.storage.local.get([PROFILE_KEY, SESSION_KEY, EPOCH_KEY]);
  const profile = stored[PROFILE_KEY];
  const legacy = validSession(stored[SESSION_KEY]) ? stored[SESSION_KEY] : null;
  const user = profile?.version === 1 && UUID.test(profile.userId) ? profile : legacy;
  return user ? { userId: user.userId, email: typeof user.email === "string" ? user.email.slice(0, 254) : "", cloudStatus: profile?.cloudStatus || "available", epoch: stored[EPOCH_KEY] || "legacy" } : null;
}

export async function assertLocalAccount(account) {
  const current = await readLocalAccount();
  if (!current || !account || current.userId !== account.userId || current.epoch !== account.epoch) throw new Error("The local account changed. Reopen the extension before continuing.");
}

export async function reportCloudFailure(accessToken, status) {
  return withStateLock(async () => {
    const current = await readSession();
    if (current?.accessToken !== accessToken) return;
    const account = await readLocalAccount();
    if (account?.cloudStatus === "restricted" && status === "unavailable") return;
    await chrome.storage.local.set({ [PROFILE_KEY]: { version: 1, userId: current.userId, email: current.email, cloudStatus: status } });
  });
}

class SessionRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "SessionRequestError";
    this.status = status;
  }
}

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
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  const payload = await readJson(response, failureMessage);
  if (!response.ok) {
    throw new SessionRequestError(
      readApiError(payload, failureMessage),
      response.status,
    );
  }
  const session = payload?.data?.session;
  if (
    typeof session?.accessToken !== "string" ||
    !session.accessToken ||
    typeof session.refreshToken !== "string" ||
    !session.refreshToken ||
    !Number.isSafeInteger(session.expiresAt) ||
    session.expiresAt < 1 ||
    !UUID.test(session.user?.id)
  ) {
    throw new Error(failureMessage);
  }
  return session;
}

async function readSession() {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  return validSession(stored[SESSION_KEY]) ? stored[SESSION_KEY] : null;
}

async function writeSession(session) {
  const account = await readLocalAccount();
  if (account && account.userId !== session.userId) throw new Error("This is a different account. Disconnect explicitly before switching accounts; your saved key was not changed.");
  await chrome.storage.local.set({
    [SESSION_KEY]: session,
    [PROFILE_KEY]: { version: 1, userId: session.userId, email: session.email, cloudStatus: "available" },
  });
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

async function performRefresh(session) {
  const account = await readLocalAccount();
  if (!account || account.userId !== session.userId) throw new Error("Reconnect to the original account.");
  const current = await readSession();
  if (!current) throw new Error("Reconnect to the cloud. Your saved key remains on this device.");
  if (current.refreshToken !== session.refreshToken && current.expiresAt > Date.now() + 60_000) return current;
  let payload;
  try {
    payload = await requestSession(
      "/v1/auth/session/refresh",
      { refreshToken: session.refreshToken },
      "Your FavLock session expired. Connect the extension again.",
    );
  } catch (error) {
    if (error instanceof SessionRequestError && (error.status === 401 || error.status === 403)) {
      await reportCloudFailure(session.accessToken, error.status === 401 ? "reconnect_required" : "restricted");
      throw new Error("Cloud access is unavailable. Reconnect when needed; your saved key remains on this device.");
    }
    await reportCloudFailure(session.accessToken, "unavailable");
    throw new Error("FavLock is temporarily unavailable. Try again.");
  }
  if (payload.user.id !== session.userId) {
    await reportCloudFailure(session.accessToken, "reconnect_required");
    throw new Error("Reconnect to the original account. Your saved key was not changed.");
  }
  const nextSession = {
    ...session,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresAt: Number(payload.expiresAt) * 1000,
  };
  return withStateLock(async () => {
    await assertLocalAccount(account);
    const latest = await readSession();
    if (!latest) throw new Error("Sign-in was cancelled.");
    if (latest.refreshToken !== session.refreshToken) return latest;
    await writeSession(nextSession);
    return nextSession;
  });
}

export function refreshSession(session) {
  refreshPromise ??= (globalThis.navigator?.locks
    ? navigator.locks.request("favlock-extension-refresh", () => performRefresh(session))
    : performRefresh(session)).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export async function getValidSession() {
  const session = await readSession();
  if (!session) return null;
  const account = await readLocalAccount();
  if (account?.userId !== session.userId) throw new Error("Reconnect to the original account.");
  await withStateLock(async () => {
    const stored = await chrome.storage.local.get(PROFILE_KEY);
    if (!stored[PROFILE_KEY]) {
      await assertLocalAccount(account);
      await writeSession(session);
    }
  });
  if (globalThis.navigator?.onLine === false) throw new Error("You are offline. Your saved key remains on this device.");
  if (["restricted", "reconnect_required"].includes(account.cloudStatus)) throw new Error("Reconnect to cloud services when needed. Your saved key remains on this device.");
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

export function buildExtensionPairUrl({
  dashboardUrl,
  extensionId,
  pairingAttempt,
}) {
  const pairPath = new URL("extension/pair", dashboardUrl);
  pairPath.searchParams.set("extensionId", extensionId);
  pairPath.searchParams.set("attempt", pairingAttempt);
  return pairPath;
}

export async function beginExtensionConnection() {
  assertConfiguredExtensionId();
  await rememberOriginalTab();
  const pairingAttempt = createRandomUrlToken();
  await chrome.storage.session.set({
    [PAIRING_ATTEMPT_KEY]: {
      value: pairingAttempt,
      expiresAt: Date.now() + PAIRING_ATTEMPT_TTL_MS,
    },
  });
  const pairUrl = buildExtensionPairUrl({
    dashboardUrl: FAVLOCK_CONFIG.dashboardUrl,
    extensionId: chrome.runtime.id,
    pairingAttempt,
  });
  await chrome.tabs.create({ url: pairUrl.toString() });
  return { needsKey: true };
}

function getSenderOrigin(sender) {
  let senderOrigin = sender.origin;
  if (!senderOrigin && sender.url) {
    try {
      senderOrigin = new URL(sender.url).origin;
    } catch {
      senderOrigin = null;
    }
  }
  return senderOrigin;
}

export async function receivePairedKey(message, sender) {
  if (message?.type !== PAIR_KEY_MESSAGE) return null;
  if (getSenderOrigin(sender) !== new URL(FAVLOCK_CONFIG.dashboardUrl).origin) {
    return { ok: false, error: "Untrusted pairing origin." };
  }
  try {
    const storedAttempt = (await chrome.storage.session.get(PAIRING_ATTEMPT_KEY))[
      PAIRING_ATTEMPT_KEY
    ];
    if (
      typeof message.pairingAttempt !== "string" ||
      !storedAttempt ||
      message.pairingAttempt !== storedAttempt.value ||
      !Number.isSafeInteger(storedAttempt.expiresAt) ||
      storedAttempt.expiresAt < Date.now()
    ) {
      throw new Error("This extension connection request expired. Start again from the extension.");
    }
    const initialEpoch = (await chrome.storage.local.get(EPOCH_KEY))[EPOCH_KEY];
    const localMode = message.localMode === true;
    const localProjection = localMode
      ? normalizeLocalProjection(message.localProjection, message.userId)
      : null;
    if (localMode && !localProjection) {
      throw new Error("FavLock did not provide a valid encrypted local library projection.");
    }
    const localAccount = await readLocalAccount();
    if (localAccount && localAccount.userId !== message.userId) throw new Error("This is a different account. Disconnect explicitly before switching accounts; your saved key was not changed.");
    let session = null;
    if (!localMode) {
      try {
        session = await getValidSession();
      } catch {
        session = null;
      }
    }
    let replacingSession = false;
    if (!localMode && (!session || session.userId !== message.userId)) {
      session = await exchangeExtensionSessionToken({
        tokenHash: message.sessionTokenHash,
        expectedUserId: message.userId,
      });
      replacingSession = true;
    }
    if (!localMode && session.userId !== message.userId) {
      throw new Error("The paired FavLock account does not match.");
    }

    const key = await importLibraryKey(message.rawKey);
    await withStateLock(async () => {
      if ((await chrome.storage.local.get(EPOCH_KEY))[EPOCH_KEY] !== initialEpoch) throw new Error("Pairing was cancelled.");
      const currentAccount = await readLocalAccount();
      if (currentAccount && currentAccount.userId !== message.userId) throw new Error("The local account changed. Pair again.");
      if (localMode) {
        await chrome.storage.local.remove(SESSION_KEY);
        await chrome.storage.local.set({
          [PROFILE_KEY]: {
            version: 1,
            userId: message.userId,
            email: "",
            cloudStatus: "local",
          },
          [LOCAL_PROJECTION_KEY]: localProjection,
        });
      } else if (replacingSession) {
        await writeSession(session);
      }
      if (!localMode) await removeLocalProjection();
      await saveLibraryKey(key);
      await chrome.storage.session.remove(PAIRING_ATTEMPT_KEY);
    });
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

export async function receiveLocalProjection(message, sender) {
  if (message?.type !== LOCAL_PROJECTION_MESSAGE) return null;
  if (getSenderOrigin(sender) !== new URL(FAVLOCK_CONFIG.dashboardUrl).origin) {
    return { ok: false, error: "Untrusted dashboard origin." };
  }
  try {
    const account = await readLocalAccount();
    if (!account || account.cloudStatus !== "local") {
      throw new Error("Connect a local FavLock vault before refreshing its library.");
    }
    if (message.userId !== account.userId) {
      throw new Error("The encrypted local library belongs to another account.");
    }
    await withStateLock(async () => {
      await assertLocalAccount(account);
      await writeLocalProjection(message.projection, account.userId);
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Local library refresh failed.",
    };
  }
}

export async function getConnectionState() {
  let session = null;
  try {
    session = await getValidSession();
  } catch {
    session = await readSession();
  }
  const account = await readLocalAccount();
  return {
    connected: !!account,
    unlocked: !!(await loadLibraryKey()),
    email: account?.email || session?.email || "",
    cloudStatus: account?.cloudStatus === "local"
      ? "local"
      : globalThis.navigator?.onLine === false
        ? "offline"
        : !session
          ? "reconnect_required"
          : account?.cloudStatus || "available",
  };
}

export async function getExternalOnboardingStatus(message, sender) {
  if (message?.type !== ONBOARDING_STATUS_MESSAGE) return null;
  if (getSenderOrigin(sender) !== new URL(FAVLOCK_CONFIG.dashboardUrl).origin) {
    return { ok: false, error: "Untrusted dashboard origin." };
  }
  if (!UUID.test(message.userId ?? "")) {
    return { ok: false, error: "Invalid dashboard account." };
  }

  const [account, libraryKey] = await Promise.all([
    readLocalAccount(),
    loadLibraryKey(),
  ]);
  return {
    ok: true,
    connected: !!account,
    unlocked: !!libraryKey,
    accountMatches: account ? account.userId === message.userId : null,
  };
}

export async function disconnectExtension() {
  await withStateLock(async () => {
    await chrome.storage.local.set({ [EPOCH_KEY]: crypto.randomUUID() });
    await Promise.all([
      chrome.storage.local.remove([SESSION_KEY, PROFILE_KEY]),
      chrome.storage.session.remove([ORIGINAL_TAB_KEY, PAIRING_ATTEMPT_KEY]),
      deleteLibraryKey(),
      removeLocalProjection(),
    ]);
  });
}
