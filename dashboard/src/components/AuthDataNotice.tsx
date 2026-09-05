import {
  WEB_PRIVACY_URL,
  WEB_TERMS_URL,
} from "../lib/appUrls";

const legalLinkClass =
  "font-semibold text-emerald-700 dark:text-emerald-300 underline decoration-emerald-700/25 underline-offset-2 hover:text-emerald-800 hover:dark:text-emerald-200";

export function GoogleAccountDataNotice() {
  return (
    <p className="mt-3 rounded-lg border border-[var(--app-ink)]/10 bg-[#fffdf5]/70 px-3 py-2.5 text-xs leading-5 text-[#606674]">
      <strong className="font-semibold text-[#343945]">
        Google account data:
      </strong>{" "}
      FavLock uses your name, email address, and Google account identifier
      only to create and authenticate your account.{" "}
      <a
        href={`${WEB_PRIVACY_URL}#data-we-process`}
        target="_blank"
        rel="noopener noreferrer"
        className={legalLinkClass}
      >
        Learn more
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      .
    </p>
  );
}

export function AuthLegalNotice() {
  return (
    <p className="mt-5 text-center text-xs leading-5 text-[var(--app-muted)]">
      By continuing, you agree to the{" "}
      <a
        href={WEB_TERMS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={legalLinkClass}
      >
        Terms of Service
        <span className="sr-only"> (opens in a new tab)</span>
      </a>{" "}
      and acknowledge the{" "}
      <a
        href={WEB_PRIVACY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={legalLinkClass}
      >
        Privacy Policy
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      .
    </p>
  );
}
