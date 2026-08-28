import { useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { favLockAuth } from "../lib/favLockAuth";
import { buildAuthPath, getPostAuthPath, normalizePostAuthPath } from "../lib/authNavigation";
import type { AuthCallbackFailure } from "../lib/authCallback";
import { WEB_TERMS_URL } from "../lib/appUrls";
import { AuthLayout } from "./ui/auth-layout";
import { Heading } from "./ui/heading";
import { Text } from "./ui/text";
import { Button } from "./ui/button";

const MESSAGES: Record<AuthCallbackFailure, string> = {
  cancelled: "Sign-in was cancelled. You can try Google again or sign in with email.",
  email_rejected: "Disposable email addresses are not allowed for new FavLock accounts. Please use a permanent email address.",
  provider_error: "Sign-in could not be completed. Try Google again, or sign in with email. If the problem continues, try again later.",
  invalid_link: "This link may have expired or already been used. Try signing in. If your email still needs confirmation, request a new link and open the latest email.",
  missing_state: "Open the latest link in the browser and profile where you started. If you used another device or cleared browser storage, try signing in with your email and password. If confirmation is still needed, request a new link here.",
  unsupported_callback: "This link cannot sign you in here. Try signing in with your email and password, or request a new confirmation link and open it in this browser.",
  temporarily_unavailable: "We could not finish signing you in. Check your connection, wait a moment, then retry this link. If it has already been used, sign in again.",
  storage_unavailable: "Your browser could not save the session. Allow site storage and retry. Do not clear your local library to fix this. If the link was already used, sign in again.",
  account_changed: "This sign-in no longer matches the account or attempt in this browser. Your local library was not changed. Reconnect to the original account, or use a separate browser profile for another account.",
};

export default function AuthCallbackBoundary({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const location = useLocation();
  const failure = favLockAuth.getCallbackFailure();
  if (loading || !failure || location.pathname === "/reset-password") return children;

  const nextPath = ["/login", "/register", "/reset-password"].includes(location.pathname)
    ? getPostAuthPath(new URLSearchParams(location.search))
    : normalizePostAuthPath(`${location.pathname}${location.search}${location.hash}`);
  const signInPath = buildAuthPath("/login", nextPath, { reconnect: !!user });
  const confirmationPath = new URL(signInPath, window.location.origin);
  confirmationPath.searchParams.set("confirmation", "1");
  const retryable = failure === "temporarily_unavailable" || failure === "storage_unavailable";

  // Full navigation starts a fresh initializer without carrying callback secrets
  // into `next`. Retrying instead keeps the original code and browser verifier.
  return <AuthLayout>
    <section aria-labelledby="auth-return-heading">
      <Heading id="auth-return-heading">{failure === "cancelled" ? "Sign-in cancelled" : "This link could not sign you in"}</Heading>
      <Text className="mt-3" role="alert">{MESSAGES[failure]}</Text>
      {failure === "email_rejected" && <Text className="mt-3">See the <a className="underline" href={`${WEB_TERMS_URL}#disposable-email-addresses`}>Terms of Service</a>. If this is a mistake, contact <a className="underline" href="mailto:support@favlock.app">support@favlock.app</a>.</Text>}
      <div className="mt-6 flex flex-col gap-3">
        {retryable && <Button color="emerald" onClick={() => window.location.reload()}>Retry this link</Button>}
        <Button href={signInPath} outline>{user ? "Reconnect to your account" : "Back to sign in"}</Button>
        {!user && <a className="min-h-11 px-3 py-2 text-center text-sm font-medium text-emerald-700 underline" href={`${confirmationPath.pathname}${confirmationPath.search}`}>Request a new confirmation email</a>}
        {user && <a className="min-h-11 px-3 py-2 text-center text-sm underline" href={nextPath}>Back to local library</a>}
      </div>
    </section>
  </AuthLayout>;
}
