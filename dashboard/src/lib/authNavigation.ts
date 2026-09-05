import { DASHBOARD_HOME_URL, DASHBOARD_URL } from "./appUrls";
import { withoutAuthCallback } from "./authCallback";

export const PRO_CHECKOUT_PATH = "/checkout";

// Keep aligned with the protected routes in App.tsx, including legacy aliases.
const POST_AUTH_PATHS = new Set([
  "/", "/checkout", "/extension/pair", "/favorites", "/unsorted",
  "/write", "/notes", "/tasks", "/todos", "/readspace", "/lists",
  "/trash", "/support", "/settings",
]);

export type AuthMode = "sign-in" | "sign-up";

export function getAuthMode(searchParams: URLSearchParams): AuthMode {
  if (
    searchParams.get("reconnect") === "1" &&
    searchParams.get("merge") !== "1"
  ) return "sign-in";
  const modes = searchParams.getAll("mode");
  return modes.length === 1 && modes[0] === "sign-up" ? "sign-up" : "sign-in";
}

export function normalizePostAuthPath(nextPath: string | null): string {
  if (!nextPath || nextPath.length > 2048 || !nextPath.startsWith("/") ||
    nextPath.startsWith("//") || nextPath.includes("\\") ||
    Array.from(nextPath).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) {
    return "/";
  }

  try {
    const dashboardUrl = new URL(`${DASHBOARD_URL}/`);
    const destination = withoutAuthCallback(new URL(nextPath, dashboardUrl));
    const pathname = destination.pathname.replace(/\/$/, "") || "/";
    const knownPath = POST_AUTH_PATHS.has(pathname) || /^\/(c|t)\/[^/]+$/.test(pathname);

    if (
      destination.origin !== dashboardUrl.origin ||
      !knownPath || /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(pathname)
    ) {
      return "/";
    }

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}

export function getPostAuthPath(searchParams: URLSearchParams): string {
  if (searchParams.getAll("next").length !== 1) return "/";
  return normalizePostAuthPath(searchParams.get("next"));
}

export function buildAuthPath(
  authPath: "/login",
  nextPath: string,
  options: { mode?: AuthMode; reconnect?: boolean; merge?: boolean } = {},
): string {
  const normalizedNextPath = normalizePostAuthPath(nextPath);
  const searchParams = new URLSearchParams();
  if (options.mode === "sign-up" && (!options.reconnect || options.merge)) searchParams.set("mode", "sign-up");
  if (normalizedNextPath !== "/") searchParams.set("next", normalizedNextPath);
  if (options.reconnect) searchParams.set("reconnect", "1");
  if (options.merge) searchParams.set("merge", "1");
  return `${authPath}${searchParams.size ? `?${searchParams}` : ""}`;
}

export function getDashboardRedirectUrl(nextPath: string): string {
  const normalizedNextPath = normalizePostAuthPath(nextPath);
  if (normalizedNextPath === "/") return DASHBOARD_HOME_URL;
  return new URL(normalizedNextPath, `${DASHBOARD_URL}/`).toString();
}
