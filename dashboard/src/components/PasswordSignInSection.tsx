import { useRef, useState, type SubmitEvent } from "react";
import { Check } from "lucide-react";
import { favLockAuth } from "../lib/favLockAuth";
import { Button } from "./ui/button";
import { Field, FieldGroup, Label } from "./ui/fieldset";
import { Text } from "./ui/text";
import CloudflareTurnstile, {
  type CloudflareTurnstileHandle,
} from "./CloudflareTurnstile";
import PasswordStrengthMeter from "./PasswordStrengthMeter";
import PasswordInput from "./PasswordInput";
import { MIN_PASSWORD_LENGTH } from "../lib/passwordPolicy";

export default function PasswordSignInSection({
  email,
  hasPassword,
}: {
  email: string;
  hasPassword: boolean;
}) {
  const [passwordExists, setPasswordExists] = useState(hasPassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<CloudflareTurnstileHandle>(null);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (passwordExists && !currentPassword) {
      setError("Enter your current password.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (passwordExists && !captchaToken) {
      setError("Complete the security verification before changing your password.");
      return;
    }

    setSaving(true);

    if (passwordExists) {
      const { error: confirmationError } =
        await favLockAuth.signInWithPassword({
          email,
          password: currentPassword,
          options: { captchaToken: captchaToken! },
        });
      captchaRef.current?.reset();

      if (confirmationError) {
        setSaving(false);
        setError("Current password is incorrect.");
        return;
      }
    }

    const { error: updateError } = await favLockAuth.updateUser({
      password,
      ...(passwordExists ? { current_password: currentPassword } : {}),
      data: { password_sign_in_enabled: true },
    });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCurrentPassword("");
    setPassword("");
    setConfirmPassword("");
    setPasswordExists(true);
    setSuccess(
      `Password saved. You can now sign in as ${email} with Google or your password.`,
    );
  };

  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white/80 p-4 shadow-sm sm:p-5">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold liquid-ink">
            Password sign-in
          </h3>
          <p className="mt-1 text-sm liquid-muted">
            {passwordExists
              ? "Confirm your current password before choosing a new one."
              : "Add a password so you can sign in with your email as well as Google."}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3"
          >
            <Text className="text-sm text-red-600!">{error}</Text>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3"
          >
            <Check
              className="h-4 w-4 shrink-0 text-emerald-600"
              aria-hidden="true"
            />
            <Text className="text-sm text-emerald-600!">{success}</Text>
          </div>
        )}

        <FieldGroup>
          {passwordExists && (
            <Field>
              <Label>Current password</Label>
              <PasswordInput
                visibilityLabel="current password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </Field>
          )}

          <Field>
            <Label>New password</Label>
            <PasswordInput
              visibilityLabel="new password"
              autoComplete="new-password"
              placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
            />
            <PasswordStrengthMeter password={password} />
          </Field>

          <Field>
            <Label>Confirm new password</Label>
            <PasswordInput
              visibilityLabel="confirm new password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
            />
          </Field>
        </FieldGroup>

        {passwordExists && (
          <CloudflareTurnstile
            ref={captchaRef}
            action="confirm_password"
            onVerify={setCaptchaToken}
          />
        )}

        <Button
          type="submit"
          color="emerald"
          disabled={saving || (passwordExists && !captchaToken)}
          className="cursor-pointer"
        >
          {saving ? "Changing password..." : "Change password"}
        </Button>
      </form>
    </section>
  );
}
