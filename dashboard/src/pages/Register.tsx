import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type SubmitEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Description } from "@headlessui/react";
import { ArrowLeft, LogIn, Mail, MailCheck, UserPlus } from "lucide-react";
import { favLockAuth } from "../lib/favLockAuth";
import { Button } from "../components/ui/button";
import { ErrorMessage, Field, FieldGroup, Label } from "../components/ui/fieldset";
import { Input } from "../components/ui/input";
import { Heading } from "../components/ui/heading";
import { Text } from "../components/ui/text";
import { AuthLayout } from "../components/ui/auth-layout";
import GoogleAuthButton from "../components/GoogleAuthButton";
import { AuthLegalNotice } from "../components/AuthDataNotice";
import PasswordInput from "../components/PasswordInput";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import CloudflareTurnstile, {
  type CloudflareTurnstileHandle,
} from "../components/CloudflareTurnstile";
import {
  buildAuthPath,
  getAuthMode,
  getDashboardRedirectUrl,
  getPostAuthPath,
  type AuthMode,
} from "../lib/authNavigation";
import { WEB_TERMS_URL } from "../lib/appUrls";
import { MIN_PASSWORD_LENGTH } from "../lib/passwordPolicy";
import { isPasswordRecoveryRedirectUrl } from "../lib/authRecovery";

const SUPPORT_EMAIL = "support@favlock.app";
const DISPOSABLE_EMAIL_TERMS_URL = `${WEB_TERMS_URL}#disposable-email-addresses`;

const EMAIL_MODES: AuthMode[] = ["sign-in", "sign-up"];

function AuthErrorNotice({ message }: { message: string }) {
  const isDisposableEmailError = message.includes(
    "Disposable email addresses are not allowed",
  );

  return (
    <div
      className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3"
      role="alert"
      id="email-auth-error"
    >
      <Text className="text-sm text-red-600!">
        {isDisposableEmailError ? (
          <>
            Disposable email addresses are not allowed for new FavLock
            accounts. Please use a permanent email address. See the{" "}
            <a
              href={DISPOSABLE_EMAIL_TERMS_URL}
              className="font-semibold underline underline-offset-4"
            >
              Terms of Service
            </a>
            . If this is a mistake, contact{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-semibold underline underline-offset-4"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </>
        ) : (
          message
        )}
      </Text>
    </div>
  );
}

function EmailConfirmation({
  email,
  emailRedirectTo,
  initiallySent,
  onUseDifferentEmail,
  onBackToSignIn,
}: {
  email: string;
  emailRedirectTo: string;
  initiallySent: boolean;
  onUseDifferentEmail: () => void;
  onBackToSignIn: () => void;
}) {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [resendEmail, setResendEmail] = useState(email);
  const [retryAt, setRetryAt] = useState(() => initiallySent ? Date.now() + 60_000 : 0);
  const [now, setNow] = useState(Date.now);
  const remainingSeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const resendingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const captchaRef = useRef<CloudflareTurnstileHandle>(null);

  useEffect(() => { panelRef.current?.focus(); }, []);
  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  const handleResend = async () => {
    if (resendingRef.current || Date.now() < retryAt) return;
    const normalizedEmail = resendEmail.trim();
    if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(normalizedEmail)) {
      setResendError("Enter the email address you used to sign up.");
      return;
    }
    if (!captchaToken) {
      setResendError(
        "Complete the security verification before requesting another email.",
      );
      return;
    }

    resendingRef.current = true;
    setResending(true);
    setResendError(null);
    setResent(false);

    setNow(Date.now());
    setRetryAt(Date.now() + 60_000);
    try {
      const { error } = await favLockAuth.resend({
        type: "signup",
        email: normalizedEmail,
        options: { captchaToken, emailRedirectTo },
      });
      if (error) {
        setResendError("code" in error && error.code === "rate_limited"
          ? "Too many email requests. Wait at least a minute before trying again. The email service may require a longer wait."
          : error.message);
        return;
      }
      setResent(true);
    } catch {
      setResendError("We could not confirm the request. Check your inbox before trying again.");
    } finally {
      captchaRef.current?.reset();
      setCaptchaToken(null);
      resendingRef.current = false;
      setResending(false);
    }
  };

  return (
    <div ref={panelRef} tabIndex={-1} aria-labelledby="confirmation-heading" className="w-full text-center outline-none">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-emerald-700/20 bg-emerald-500/12 text-emerald-700 shadow-[0_4px_0_rgba(15,118,110,0.12)]">
        <MailCheck className="size-7" aria-hidden="true" />
      </div>

      <Heading id="confirmation-heading" className="mt-5">{initiallySent || resent ? "Check your inbox" : "Confirm your email"}</Heading>
      <Text className="mt-2">{initiallySent ? "Your signup request was accepted. Check for a confirmation email at" : "Request a new link for the email you used to sign up."}</Text>
      {email && <p className="mt-1 break-all text-sm font-bold text-[#202229]">{email}</p>}

      <div className="mt-5 rounded-xl border border-[#1d2230]/10 bg-[#fffdf5]/70 px-4 py-3 text-left">
        <p className="text-sm font-semibold text-[#202229]">
          Confirm your email to finish signing up
        </p>
        <p className="mt-1 text-sm leading-5 text-[#555b6b]">
          You are not signed in yet. Open the latest confirmation link in this
          browser and profile to continue. Check your spam folder too.
        </p>
        <p className="mt-2 text-sm leading-5 text-[#555b6b]">Opened it on another device, or already confirmed? Go back to sign in with your email and password. If confirmation is still needed, request a new link here.</p>
      </div>

      <div className="mt-5 border-t border-[#1d2230]/10 pt-5 text-left">
        <p className="text-sm font-semibold text-[#202229]">
          Didn’t receive it?
        </p>
        <p className="mt-1 text-sm leading-5 text-[#555b6b]">
          If the link expired, request a new one below. Wait at least 60 seconds
          between requests; the email service may apply longer limits.
        </p>
        {!email && <Field className="mt-4">
          <Label>Email</Label>
          <Input name="confirmationEmail" type="email" autoComplete="email" required value={resendEmail} disabled={resending} onChange={(event) => setResendEmail(event.target.value)} />
        </Field>}

        {resendError && (
          <div
            className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3"
            role="alert"
          >
            <Text className="text-sm text-red-600!">{resendError}</Text>
          </div>
        )}

        {resent && (
          <div
            className="mt-3 rounded-lg border border-emerald-600/25 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-800"
            role="status"
            aria-live="polite"
          >
            Request accepted. If this address needs confirmation, a new email will arrive. Open the latest link in this browser.
          </div>
        )}

        <CloudflareTurnstile
          ref={captchaRef}
          action="resend-signup-confirmation"
          onVerify={setCaptchaToken}
        />
        <Button
          type="button"
          outline
          className="mt-3 w-full"
          disabled={resending || !captchaToken || remainingSeconds > 0}
          onClick={() => void handleResend()}
        >
          <Mail data-slot="icon" aria-hidden="true" />
          {resending ? "Sending..." : remainingSeconds > 0 ? `Resend available in ${remainingSeconds}s` : "Resend confirmation email"}
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        <button
          type="button"
          className="font-medium text-emerald-700 hover:underline"
          onClick={onUseDifferentEmail}
          disabled={resending}
        >
          Use a different email
        </button>
        <span className="text-[#1d2230]/20" aria-hidden="true">
          •
        </span>
        <button
          type="button"
          className="font-medium text-emerald-700 hover:underline"
          onClick={onBackToSignIn}
          disabled={resending}
        >
          Back to sign in
        </button>
      </div>
    </div>
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reconnecting = searchParams.get("reconnect") === "1";
  const requestingConfirmation = searchParams.get("confirmation") === "1";
  const nextPath = getPostAuthPath(searchParams);
  const emailRedirectTo = getDashboardRedirectUrl(nextPath);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const emailMode = getAuthMode(searchParams);
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<"email" | "password" | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(
    null,
  );
  const [confirmationSent, setConfirmationSent] = useState(false);
  const captchaRef = useRef<CloudflareTurnstileHandle>(null);

  useEffect(() => {
    setError(null);
    setPassword("");
    setInvalidField(null);
    setConfirmationEmail(null);
    setConfirmationSent(false);
    captchaRef.current?.reset();
    setCaptchaToken(null);
  }, [emailMode, requestingConfirmation]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (isPasswordRecoveryRedirectUrl(url)) {
      navigate(
        `/reset-password${window.location.search}${window.location.hash}`,
        { replace: true },
      );
      return;
    }

  }, [navigate]);

  const resetCaptcha = () => {
    captchaRef.current?.reset();
    setCaptchaToken(null);
  };

  const switchEmailMode = (mode: AuthMode) => {
    if (mode === emailMode || (reconnecting && mode === "sign-up")) return;
    navigate(buildAuthPath("/login", nextPath, { mode, reconnect: reconnecting }));
  };

  const selectEmailModeFromKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentMode: AuthMode,
  ) => {
    if (reconnecting) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const currentIndex = EMAIL_MODES.indexOf(currentMode);
    const nextMode =
      event.key === "Home"
        ? EMAIL_MODES[0]
        : event.key === "End"
          ? EMAIL_MODES[EMAIL_MODES.length - 1]
          : event.key === "ArrowRight"
            ? EMAIL_MODES[(currentIndex + 1) % EMAIL_MODES.length]
            : EMAIL_MODES[
                (currentIndex - 1 + EMAIL_MODES.length) % EMAIL_MODES.length
              ];

    switchEmailMode(nextMode);
    document.getElementById(`email-${nextMode}-tab`)?.focus();
  };

  const handleEmailSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setInvalidField(null);

    const rejectField = (field: "email" | "password", message: string) => {
      setError(message);
      setInvalidField(field);
      const input = event.currentTarget.elements.namedItem(field);
      if (input instanceof HTMLInputElement) input.focus();
    };

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      rejectField("email", "Enter your email address.");
      return;
    }

    if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(normalizedEmail)) {
      rejectField("email", "Enter a valid email address.");
      return;
    }

    if (!password) {
      rejectField("password", "Enter your password.");
      return;
    }

    if (emailMode === "sign-up" && password.length < MIN_PASSWORD_LENGTH) {
      rejectField(
        "password",
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }

    if (emailMode === "sign-up" && password.length > 1024) {
      rejectField("password", "Password must be no more than 1024 characters.");
      return;
    }

    if (!captchaToken) {
      setError(
        emailMode === "sign-up"
          ? "Complete the security verification before creating an account."
          : "Complete the security verification before signing in.",
      );
      return;
    }

    setLoading(true);

    if (emailMode === "sign-in") {
      const { error: signInError } = await favLockAuth.signInWithPassword({
        email: normalizedEmail,
        password,
        options: { captchaToken },
      });
      resetCaptcha();

      if (signInError) {
        if ("code" in signInError && signInError.code === "email_not_confirmed") {
          setPassword("");
          setConfirmationSent(false);
          setConfirmationEmail(normalizedEmail);
        }
        setError(signInError.message);
        setLoading(false);
        return;
      }

      setLoading(false);
      navigate(nextPath);
      return;
    }

    const { data, error: signUpError } = await favLockAuth.signUp({
      email: normalizedEmail,
      password,
      options: {
        captchaToken,
        emailRedirectTo,
      },
    });
    resetCaptcha();

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    if (data.session) {
      navigate(nextPath);
      return;
    }

    setPassword("");
    setConfirmationSent(true);
    setConfirmationEmail(normalizedEmail);
  };

  if (confirmationEmail || requestingConfirmation) {
    return (
      <AuthLayout>
        <EmailConfirmation
          email={confirmationEmail ?? ""}
          initiallySent={confirmationSent}
          emailRedirectTo={emailRedirectTo}
          onUseDifferentEmail={() => {
            setConfirmationEmail(null);
            setEmail("");
            setError(null);
            resetCaptcha();
            navigate(buildAuthPath("/login", nextPath, { mode: reconnecting ? "sign-in" : "sign-up", reconnect: reconnecting }));
          }}
          onBackToSignIn={() => {
            setConfirmationEmail(null);
            navigate(buildAuthPath("/login", nextPath, { reconnect: reconnecting }));
            setShowEmailForm(true);
            setError(null);
            resetCaptcha();
          }}
        />
      </AuthLayout>
    );
  }

  const heading = !showEmailForm
    ? emailMode === "sign-up" ? "Create your account" : "Welcome to FavLock"
    : emailMode === "sign-up"
      ? "Create account"
      : "Sign in with email";
  const description = !showEmailForm
    ? emailMode === "sign-up" ? "Choose how you want to create your account" : "Choose how you want to continue"
    : emailMode === "sign-up"
      ? "Create your account using a permanent email address"
      : "Enter your FavLock account details";

  return (
    <AuthLayout>
      <div className="w-full">
        <Heading>{heading}</Heading>
        <Text className="mt-1">{description}</Text>
        {reconnecting && <Text className="mt-3">Reconnect to the original account to use cloud services. Your local library stays on this device. <Link className="underline" to="/">Back to local library</Link></Text>}

        {error && !invalidField && <AuthErrorNotice message={error} />}

        {!showEmailForm ? (
          <div className="mt-5 space-y-3">
            <GoogleAuthButton
              onError={setError}
              redirectTo={emailRedirectTo}
            >
              Continue with Google
            </GoogleAuthButton>
            <Button
              type="button"
              outline
              className="w-full"
              onClick={() => {
                setError(null);
                setInvalidField(null);
                resetCaptcha();
                setShowEmailForm(true);
              }}
            >
              <Mail data-slot="icon" aria-hidden="true" />
              Continue with email
            </Button>
          </div>
        ) : (
          <div className="mt-4">
            <Button
              type="button"
              plain
              className="-ml-2 mb-3"
              onClick={() => {
                setError(null);
                setInvalidField(null);
                resetCaptcha();
                setShowEmailForm(false);
              }}
            >
              <ArrowLeft data-slot="icon" aria-hidden="true" />
              Back to options
            </Button>

            <div
              role="tablist"
              aria-label="Email authentication"
              className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-[#1d2230]/10 bg-[#fffdf5]/70 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
            >
              <button
                id="email-sign-in-tab"
                type="button"
                role="tab"
                aria-selected={emailMode === "sign-in"}
                aria-controls="email-auth-panel"
                tabIndex={emailMode === "sign-in" ? 0 : -1}
                onClick={() => switchEmailMode("sign-in")}
                onKeyDown={(event) =>
                  selectEmailModeFromKeyboard(event, "sign-in")
                }
                className={`theme-nav-button inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold ${
                  emailMode === "sign-in"
                    ? "theme-nav-button-active shadow-sm"
                    : ""
                }`}
              >
                <LogIn className="size-4" aria-hidden="true" />
                Sign in
              </button>
              <button
                id="email-sign-up-tab"
                disabled={reconnecting}
                type="button"
                role="tab"
                aria-selected={emailMode === "sign-up"}
                aria-controls="email-auth-panel"
                tabIndex={emailMode === "sign-up" ? 0 : -1}
                onClick={() => switchEmailMode("sign-up")}
                onKeyDown={(event) =>
                  selectEmailModeFromKeyboard(event, "sign-up")
                }
                className={`theme-nav-button inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold ${
                  emailMode === "sign-up"
                    ? "theme-nav-button-active shadow-sm"
                    : ""
                }`}
              >
                <UserPlus className="size-4" aria-hidden="true" />
                Create account
              </button>
            </div>

            <div
              id="email-auth-panel"
              role="tabpanel"
              aria-labelledby={`email-${emailMode}-tab`}
            >
              <form noValidate onSubmit={handleEmailSubmit}>
                <FieldGroup className="space-y-4!">
                  <Field>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      name="email"
                      invalid={invalidField === "email"}
                      placeholder="email@example.com"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                    {error && invalidField === "email" && (
                      <ErrorMessage id="email-auth-error" role="alert">{error}</ErrorMessage>
                    )}
                  </Field>

                  <Field>
                    <Label>Password</Label>
                    <PasswordInput
                      name="password"
                      invalid={invalidField === "password"}
                      placeholder={
                        emailMode === "sign-up"
                          ? `Minimum ${MIN_PASSWORD_LENGTH} characters`
                          : "••••••••"
                      }
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={
                        emailMode === "sign-up"
                          ? MIN_PASSWORD_LENGTH
                          : undefined
                      }
                      autoComplete={
                        emailMode === "sign-up"
                          ? "new-password"
                          : "current-password"
                      }
                    />
                    {emailMode === "sign-up" && (
                      <Description as="div" id="signup-password-requirements">
                        <PasswordStrengthMeter password={password} />
                      </Description>
                    )}
                    {error && invalidField === "password" && (
                      <ErrorMessage id="email-auth-error" role="alert">{error}</ErrorMessage>
                    )}
                  </Field>
                </FieldGroup>

                <CloudflareTurnstile
                  ref={captchaRef}
                  action={emailMode === "sign-up" ? "register" : "login"}
                  onVerify={setCaptchaToken}
                />

                <Button
                  type="submit"
                  color="emerald"
                  className="mt-6 w-full"
                  disabled={loading || !captchaToken}
                >
                  {loading
                    ? emailMode === "sign-up"
                      ? "Creating account..."
                      : "Signing in..."
                    : emailMode === "sign-up"
                      ? "Create account with email"
                      : "Sign in with email"}
                </Button>
              </form>

              {emailMode === "sign-in" && (
                <Text className="mt-4 text-center">
                  <Link
                    to="/reset-password"
                    className="font-medium text-emerald-600 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </Text>
              )}
            </div>
          </div>
        )}

        {!reconnecting && (
          <Text className="mt-5 text-center">
            {emailMode === "sign-up" ? "Already have an account? " : "New to FavLock? "}
            <Link
              to={buildAuthPath("/login", nextPath, { mode: emailMode === "sign-up" ? "sign-in" : "sign-up" })}
              className="inline-flex min-h-11 items-center rounded font-medium text-emerald-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600"
            >
              {emailMode === "sign-up" ? "Sign in" : "Create account"}
            </Link>
          </Text>
        )}
        <AuthLegalNotice />
        {!reconnecting && (
          <p className="mt-2 text-center text-xs leading-5">
            <Link
              className="inline-flex min-h-11 items-center rounded px-2 text-[#686d78] underline decoration-[#686d78]/30 underline-offset-2 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600"
              to={`${buildAuthPath("/login", nextPath)}${nextPath === "/" ? "?" : "&"}confirmation=1`}
            >
              Need another confirmation email?
            </Link>
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
