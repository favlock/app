export function readAuthUrl(
  value: string | undefined,
  production: boolean,
): string {
  if (!value) throw new Error("VITE_AUTH_URL is required.");

  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("VITE_AUTH_URL must use http or https.");
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "VITE_AUTH_URL must be an origin without credentials, a path, or query parameters.",
    );
  }
  if (production) {
    if (url.protocol !== "https:") {
      throw new Error("VITE_AUTH_URL must use https in production.");
    }
  }
  return url.origin;
}
