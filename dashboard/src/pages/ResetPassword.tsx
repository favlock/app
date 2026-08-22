import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { favLockAuth } from "../lib/favLockAuth";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Field, FieldGroup, Label } from "../components/ui/fieldset";
import { Input } from "../components/ui/input";
import { Heading } from "../components/ui/heading";
import { Text } from "../components/ui/text";
import { AuthLayout } from "../components/ui/auth-layout";
import { DASHBOARD_RESET_PASSWORD_URL } from "../lib/appUrls";
import CloudflareTurnstile, {
  type CloudflareTurnstileHandle,
} from "../components/CloudflareTurnstile";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import PasswordInput from "../components/PasswordInput";
import {
  consumePasswordRecoveryRedirect,
  hasPasswordRecoveryRedirect,
} from "../lib/authRecovery";
import { MIN_PASSWORD_LENGTH } from "../lib/passwordPolicy";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRecoveryFlow, setIsRecoveryFlow] = useState(false);
  const [initializingRecovery, setInitializingRecovery] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<CloudflareTurnstileHandle>(null);
  const recoveryRedirectRef = useRef(hasPasswordRecoveryRedirect());

  useEffect(() => {
    const initRecoveryFlow = async () => {
      if (!recoveryRedirectRef.current) {
        setInitializingRecovery(false);
        return;
      }

      const {
        data: { session },
        error: sessionError,
      } = await favLockAuth.getSession();

      navigate("/reset-password", { replace: true });
      consumePasswordRecoveryRedirect();

      if (sessionError || !session) {
        setError("The reset link is invalid or has expired. Request a new one.");
        setInitializingRecovery(false);
        return;
      }

      setIsRecoveryFlow(true);
      setInitializingRecovery(false);
    };

    void initRecoveryFlow();
  }, [navigate]);

  const handleReset = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email) {
      setError("Please enter an email address.");
      return;
    }

    if (!captchaToken) {
      setError("Complete the security verification before requesting a reset link.");
      return;
    }

    setLoading(true);

    const { error } = await favLockAuth.resetPasswordForEmail(email, {
      redirectTo: DASHBOARD_RESET_PASSWORD_URL,
      captchaToken,
    });
    captchaRef.current?.reset();

    if (error) {
      setError(error.message);
    } else {
      setSuccess(
        "Check your email for a password reset link. Follow the instructions in the message.",
      );
    }

    setLoading(false);
  };

  const handleUpdatePassword = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newPassword || !confirmPassword) {
      setError("Fill in both password fields.");
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await favLockAuth.updateUser({
      password: newPassword,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess("Password updated. Redirecting you to sign in...");
    setLoading(false);

    setTimeout(() => {
      navigate("/login", { replace: true });
    }, 1200);
  };

  if (initializingRecovery) {
    return (
      <AuthLayout>
        <div className="w-full">
          <Heading>Reset password</Heading>
          <Text className="mt-1" role="status" aria-live="polite">
            Validating reset link...
          </Text>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="w-full">
        <Heading>Reset password</Heading>
        <Text className="mt-1">
          {isRecoveryFlow
            ? "Set a new password for your account."
            : "Enter your email address and we will send you a password reset link."}
        </Text>

        {error && (
          <div
            className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3"
            role="alert"
          >
            <Text className="!text-red-600  text-sm">
              {error}
            </Text>
          </div>
        )}

        {success && (
          <div
            className="mt-4 rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-3"
            role="status"
            aria-live="polite"
          >
            <Text className="!text-green-600  text-sm">
              {success}
            </Text>
          </div>
        )}

        {isRecoveryFlow ? (
          <form onSubmit={handleUpdatePassword} className="mt-8">
            <FieldGroup>
              <Field>
                <Label>New password</Label>
                <PasswordInput
                  visibilityLabel="new password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                />
                <PasswordStrengthMeter password={newPassword} />
              </Field>

              <Field>
                <Label>Confirm new password</Label>
                <PasswordInput
                  visibilityLabel="confirm new password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                />
              </Field>
            </FieldGroup>

            <Button
              type="submit"
              color="emerald"
              className="mt-8 w-full"
              disabled={loading}
            >
              {loading ? "Updating..." : "Update password"}
            </Button>
          </form>
        ) : (
          <>
            <form onSubmit={handleReset} className="mt-8">
              <FieldGroup>
                <Field>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Field>
              </FieldGroup>

              <CloudflareTurnstile
                ref={captchaRef}
                action="reset_password"
                onVerify={setCaptchaToken}
              />

              <Button
                type="submit"
                color="emerald"
                className="mt-8 w-full"
                disabled={loading || !captchaToken}
              >
                {loading ? "Sending..." : "Send reset link"}
              </Button>
            </form>

            <Text className="mt-6 text-center">
              Found your account?{" "}
              <Link
                to="/login"
                className="text-emerald-500 font-medium hover:underline"
              >
                Sign in
              </Link>
            </Text>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
