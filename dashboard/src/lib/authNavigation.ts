import { DASHBOARD_HOME_URL, DASHBOARD_URL } from "./appUrls";

export const PRO_CHECKOUT_PATH = "/checkout";

const PUBLIC_AUTH_PATHS = new Set([
  "/login",
  "/register",
  "/reset-password",
]);

export function normalizePostAuthPath(nextPath: string | null): string {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/";
  }

  try {
    const dashboardUrl = new URL(`${DASHBOARD_URL}/`);
    const destination = new URL(nextPath, dashboardUrl);

    if (
      destination.origin !== dashboardUrl.origin ||
      PUBLIC_AUTH_PATHS.has(destination.pathname)
    ) {
      return "/";
    }

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}

export function getPostAuthPath(searchParams: URLSearchParams): string {
  return normalizePostAuthPath(searchParams.get("next"));
}

export function buildAuthPath(
  authPath: "/login",
  nextPath: string,
): string {
  const normalizedNextPath = normalizePostAuthPath(nextPath);
  if (normalizedNextPath === "/") return authPath;

  const searchParams = new URLSearchParams({ next: normalizedNextPath });
  return `${authPath}?${searchParams.toString()}`;
}

export function getDashboardRedirectUrl(nextPath: string): string {
  const normalizedNextPath = normalizePostAuthPath(nextPath);
  if (normalizedNextPath === "/") return DASHBOARD_HOME_URL;
  return new URL(normalizedNextPath, `${DASHBOARD_URL}/`).toString();
}
