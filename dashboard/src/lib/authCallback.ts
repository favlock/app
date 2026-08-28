export type AuthCallbackFailure =
  | "cancelled"
  | "invalid_link"
  | "missing_state"
  | "unsupported_callback"
  | "email_rejected"
  | "provider_error"
  | "temporarily_unavailable"
  | "storage_unavailable"
  | "account_changed";

const CALLBACK_KEYS = [
  "code", "sb_flow_id", "error", "error_code", "error_description",
  "access_token", "refresh_token", "expires_in", "expires_at", "token_type",
  "provider_token", "provider_refresh_token", "token_hash",
];

export function hasAuthCallback(url: URL): boolean {
  const hash = new URLSearchParams(url.hash.slice(1));
  return CALLBACK_KEYS.some((key) => url.searchParams.has(key) || hash.has(key));
}

export function readAuthCallbackFailure(url: URL): AuthCallbackFailure | null {
  const hash = new URLSearchParams(url.hash.slice(1));
  const code = url.searchParams.get("error_code") ?? hash.get("error_code");
  const error = url.searchParams.get("error") ?? hash.get("error");
  const description = url.searchParams.get("error_description") ?? hash.get("error_description");
  if (description?.includes("Disposable email addresses are not allowed")) return "email_rejected";
  if (code === "otp_expired" || code === "flow_state_expired" || code === "flow_state_not_found") return "invalid_link";
  if (error === "access_denied" && !code) return "cancelled";
  if (error || code || url.searchParams.has("error_description") || hash.has("error_description")) return "provider_error";
  if (["access_token", "refresh_token", "token_hash", "code"].some((key) => hash.has(key)) || ["access_token", "refresh_token", "token_hash"].some((key) => url.searchParams.has(key))) return "unsupported_callback";
  if (url.searchParams.has("code") && (url.searchParams.getAll("code").length !== 1 || !url.searchParams.get("code"))) return "invalid_link";
  return null;
}

export function withoutAuthCallback(url: URL): URL {
  const clean = new URL(url);
  for (const key of CALLBACK_KEYS) clean.searchParams.delete(key);
  const hash = new URLSearchParams(clean.hash.slice(1));
  if (CALLBACK_KEYS.some((key) => hash.has(key))) {
    for (const key of CALLBACK_KEYS) hash.delete(key);
    hash.delete("type");
    clean.hash = hash.toString();
  }
  if (["signup", "recovery"].includes(clean.searchParams.get("type") ?? "")) clean.searchParams.delete("type");
  return clean;
}
