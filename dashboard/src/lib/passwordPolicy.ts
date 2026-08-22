export const MIN_PASSWORD_LENGTH = 8;

export type PasswordStrength = {
  level: 0 | 1 | 2 | 3 | 4;
  label: "Enter a password" | "Weak" | "Fair" | "Good" | "Strong";
};

const COMMON_PASSWORDS = new Set([
  "12345678",
  "admin123",
  "letmein1",
  "favlock",
  "password",
  "password1",
  "qwertyui",
  "welcome1",
]);

function isObviouslyWeak(password: string): boolean {
  const normalized = password.toLowerCase();
  return (
    COMMON_PASSWORDS.has(normalized) ||
    /^(.)\1+$/.test(password) ||
    /^(?:01234567|12345678|23456789|abcdefgh|qwertyui)$/i.test(password)
  );
}

function countCharacterTypes(password: string): number {
  return [
    /\p{Ll}/u.test(password),
    /\p{Lu}/u.test(password),
    /\p{N}/u.test(password),
    /[^\p{L}\p{N}]/u.test(password),
  ].filter(Boolean).length;
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (!password) return { level: 0, label: "Enter a password" };
  if (password.length < MIN_PASSWORD_LENGTH || isObviouslyWeak(password)) {
    return { level: 1, label: "Weak" };
  }

  const lengthLevel = password.length >= 16 ? 4 : password.length >= 12 ? 3 : 2;
  const characterTypes = countCharacterTypes(password);
  const varietyAdjustment =
    characterTypes <= 1 ? -1 : characterTypes >= 3 ? 1 : 0;
  const level = Math.max(1, Math.min(4, lengthLevel + varietyAdjustment)) as
    | 1
    | 2
    | 3
    | 4;
  const labels = ["", "Weak", "Fair", "Good", "Strong"] as const;

  return { level, label: labels[level] };
}
