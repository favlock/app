export function isPasswordRecoveryRedirectUrl(value: string | URL): boolean {
  const url = typeof value === "string" ? new URL(value) : value;
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));

  if (
    url.searchParams.get("type") === "recovery" ||
    hashParams.get("type") === "recovery"
  ) {
    return true;
  }

  return (
    url.pathname.replace(/\/+$/, "") === "/reset-password" &&
    url.searchParams.has("code")
  );
}

let initialRedirectCaptured = false;
let pendingPasswordRecoveryRedirect = false;

export function captureInitialPasswordRecoveryRedirect(): void {
  if (initialRedirectCaptured || typeof window === "undefined") return;

  initialRedirectCaptured = true;
  pendingPasswordRecoveryRedirect = isPasswordRecoveryRedirectUrl(
    window.location.href,
  );
}

export function hasPasswordRecoveryRedirect(): boolean {
  if (pendingPasswordRecoveryRedirect) return true;
  if (typeof window === "undefined") return false;

  return isPasswordRecoveryRedirectUrl(window.location.href);
}

export function consumePasswordRecoveryRedirect(): void {
  pendingPasswordRecoveryRedirect = false;
}
