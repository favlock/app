import type { AuthUser } from "./favLockAuth";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export function getProfileNamesFromUser(user: AuthUser): {
  firstName: string;
  lastName: string;
} {
  const metadata = user.user_metadata as Record<string, unknown>;
  const givenName =
    readString(metadata.given_name) || readString(metadata.first_name);
  const familyName =
    readString(metadata.family_name) || readString(metadata.last_name);

  if (givenName || familyName) {
    return {
      firstName: givenName,
      lastName: familyName,
    };
  }

  const fullName =
    readString(metadata.full_name) ||
    readString(metadata.name) ||
    readString(metadata.display_name);

  if (fullName) {
    return splitFullName(fullName);
  }

  return {
    firstName: "",
    lastName: "",
  };
}

export function hasPasswordSignIn(user: AuthUser): boolean {
  if (user.user_metadata.password_sign_in_enabled === true) {
    return true;
  }

  if (user.identities?.some((identity) => identity.provider === "email")) {
    return true;
  }

  const provider = readString(user.app_metadata.provider);
  const providers = Array.isArray(user.app_metadata.providers)
    ? user.app_metadata.providers
    : [];

  return (
    provider === "email" ||
    providers.some((value) => readString(value) === "email")
  );
}

// Display only: never persist the email-derived fallback as profile metadata.
export function getAccountDisplayName(
  profile: { first_name?: string | null; last_name?: string | null } | null | undefined,
  email: string | undefined,
): string {
  const name = [readString(profile?.first_name), readString(profile?.last_name)]
    .filter(Boolean)
    .join(" ");
  return name || readString(email).split("@")[0] || "User";
}
