import {
  evaluatePasswordStrength,
  MIN_PASSWORD_LENGTH,
} from "../lib/passwordPolicy";

const strengthColors = {
  0: "bg-[#1d2230]/10",
  1: "bg-red-500",
  2: "bg-amber-500",
  3: "bg-teal-500",
  4: "bg-emerald-600",
} as const;

const strengthTextColors = {
  0: "text-[#686d78]",
  1: "text-red-600",
  2: "text-amber-700",
  3: "text-teal-700",
  4: "text-emerald-700",
} as const;

export default function PasswordStrengthMeter({
  password,
}: {
  password: string;
}) {
  const strength = evaluatePasswordStrength(password);

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-[#606674]">Password strength</span>
        <span className={`font-semibold ${strengthTextColors[strength.level]}`}>
          {strength.label}
        </span>
      </div>
      <div
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={strength.level}
        aria-valuetext={strength.label}
        className="mt-1.5 grid grid-cols-4 gap-1"
      >
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={`h-1.5 rounded-full transition-colors ${
              segment <= strength.level
                ? strengthColors[strength.level]
                : strengthColors[0]
            }`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs leading-5 text-[#686d78]">
        At least {MIN_PASSWORD_LENGTH} characters. Mix lowercase, uppercase,
        numbers, and symbols for a stronger password.
      </p>
    </div>
  );
}
