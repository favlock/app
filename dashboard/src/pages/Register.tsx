import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type SubmitEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, LogIn, Mail, MailCheck, UserPlus } from "lucide-react";
import { favLockAuth } from "../lib/favLockAuth";
import { Button } from "../components/ui/button";
import { Field, FieldGroup, Label } from "../components/ui/fieldset";
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
  onUseDifferentEmail,
  onBackToSignIn,
}: {
  email: string;
  emailRedirectTo: string;
  onUseDifferentEmail: () => void;
  onBackToSignIn: () => void;
}) {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const captchaRef = useRef<CloudflareTurnstileHandle>(null);

  const handleResend = async () => {
    if (!captchaToken) {
      setResendError(
        "Complete the security verification before requesting another email.",
      );
      return;
    }

    setResending(true);
    setResendError(null);
    setResent(false);

    const { error } = await favLockAuth.resend({
      type: "signup",
      email,
      options: { captchaToken, emailRedirectTo },
    });

    captchaRef.current?.reset();
    setCaptchaToken(null);
    setResending(false);

    if (error) {
      setResendError(error.message);
      return;
    }

    setResent(true);
  };

  return (
    <div className="w-full text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-emerald-700/20 bg-emerald-500/12 text-emerald-700 shadow-[0_4px_0_rgba(15,118,110,0.12)]">
        <MailCheck className="size-7" aria-hidden="true" />
      </div>

      <Heading className="mt-5">Check your inbox</Heading>
      <Text className="mt-2">We sent a confirmation link to</Text>
      <p className="mt-1 break-all text-sm font-bold text-[#202229]">{email}</p>

      <div className="mt-5 rounded-xl border border-[#1d2230]/10 bg-[#fffdf5]/70 px-4 py-3 text-left">
        <p className="text-sm font-semibold text-[#202229]">
          Confirm your email to finish signing up
        </p>
        <p className="mt-1 text-sm leading-5 text-[#555b6b]">
          Open the email and select the confirmation link. You can close this
          tab afterward—we’ll sign you in when you return.
        </p>
      </div>

      <div className="mt-5 border-t border-[#1d2230]/10 pt-5 text-left">
        <p className="text-sm font-semibold text-[#202229]">
          Didn’t receive it?
        </p>
        <p className="mt-1 text-sm leading-5 text-[#555b6b]">
          Check your spam folder, or complete the security check to send a new
          link.
        </p>

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
            A new confirmation email is on its way.
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
          disabled={resending || !captchaToken}
          onClick={() => void handleResend()}
        >
          <Mail data-slot="icon" aria-hidden="true" />
          {resending ? "Sending..." : "Resend confirmation email"}
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        <button
          type="button"
          className="font-medium text-emerald-700 hover:underline"
          onClick={onUseDifferentEmail}
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
  const nextPath = getPostAuthPath(searchParams);
  const emailRedirectTo = getDashboardRedirectUrl(nextPath);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const emailMode = getAuthMode(searchParams);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(
    null,
  );
  const captchaRef = useRef<CloudflareTurnstileHandle>(null);

  useEffect(() => {
    setError(null);
    setPassword("");
    setConfirmPassword("");
    setConfirmationEmail(null);
    captchaRef.current?.reset();
    setCaptchaToken(null);
  }, [emailMode]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    const currentSearchParams = url.searchParams;

    const isRecoveryLink =
      hashParams.get("type") === "recovery" ||
      currentSearchParams.get("type") === "recovery" ||
      currentSearchParams.has("code");

    if (isRecoveryLink) {
      navigate(
        `/reset-password${window.location.search}${window.location.hash}`,
        { replace: true },
      );
      return;
    }

    const authError =
      hashParams.get("error_description") ||
      currentSearchParams.get("error_description");
    if (authError) setError(authError);
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
    setError(null);

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Enter your email address.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    if (!password) {
      setError("Enter your password.");
      return;
    }

    if (
      emailMode === "sign-up" &&
      (!firstName.trim() || !lastName.trim())
    ) {
      setError("Enter your first and last name.");
      return;
    }

    if (emailMode === "sign-up" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (emailMode === "sign-up" && password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
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
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        },
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
    setConfirmPassword("");
    setConfirmationEmail(normalizedEmail);
  };

  if (confirmationEmail) {
    return (
      <AuthLayout>
        <EmailConfirmation
          email={confirmationEmail}
          emailRedirectTo={emailRedirectTo}
          onUseDifferentEmail={() => {
            setConfirmationEmail(null);
            setEmail("");
            setError(null);
            resetCaptcha();
          }}
          onBackToSignIn={() => {
            setConfirmationEmail(null);
            switchEmailMode("sign-in");
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

        {error && <AuthErrorNotice message={error} />}

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
                  {emailMode === "sign-up" && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field>
                        <Label>First name</Label>
                        <Input
                          type="text"
                          placeholder="John"
                          autoComplete="given-name"
                          value={firstName}
                          onChange={(event) => setFirstName(event.target.value)}
                          required
                        />
                      </Field>
                      <Field>
                        <Label>Last name</Label>
                        <Input
                          type="text"
                          placeholder="Doe"
                          autoComplete="family-name"
                          value={lastName}
                          onChange={(event) => setLastName(event.target.value)}
                          required
                        />
                      </Field>
                    </div>
                  )}

                  <Field>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </Field>

                  <Field>
                    <Label>Password</Label>
                    <PasswordInput
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
                      <PasswordStrengthMeter password={password} />
                    )}
                  </Field>

                  {emailMode === "sign-up" && (
                    <Field>
                      <Label>Confirm password</Label>
                      <PasswordInput
                        visibilityLabel="confirm password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        required
                        minLength={MIN_PASSWORD_LENGTH}
                        autoComplete="new-password"
                      />
                    </Field>
                  )}
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
      </div>
    </AuthLayout>
  );
}
