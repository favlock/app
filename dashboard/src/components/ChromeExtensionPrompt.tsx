import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Puzzle, X } from "lucide-react";
import {
  checkChromeExtensionOnboardingStatus,
  supportsFavLockChromeExtension,
} from "../lib/chromeExtension";
import { CHROME_EXTENSION_URL } from "../lib/appUrls";
import { Button } from "./ui/button";

export const CHROME_EXTENSION_PROMPT_DISMISSED_KEY =
  "favlock.chrome-extension-prompt.dismissed.v1";

interface ChromeExtensionPromptProps {
  enabled: boolean;
  userId: string;
}

function hasDismissedChromeExtensionPrompt(): boolean {
  try {
    return (
      window.localStorage.getItem(CHROME_EXTENSION_PROMPT_DISMISSED_KEY) ===
      "1"
    );
  } catch {
    return false;
  }
}

export default function ChromeExtensionPrompt({
  enabled,
  userId,
}: ChromeExtensionPromptProps) {
  const [dismissed, setDismissed] = useState(
    hasDismissedChromeExtensionPrompt,
  );
  const [visible, setVisible] = useState(false);
  const extensionSupported = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      supportsFavLockChromeExtension(navigator.userAgent, navigator.vendor),
    [],
  );

  useEffect(() => {
    if (!enabled || !userId || dismissed || !extensionSupported) {
      setVisible(false);
      return;
    }

    let cancelled = false;
    void checkChromeExtensionOnboardingStatus({
      extensionId: import.meta.env.VITE_CHROME_EXTENSION_ID,
      userId,
    }).then((status) => {
      if (!cancelled) setVisible(status === "not-installed");
    });

    return () => {
      cancelled = true;
    };
  }, [dismissed, enabled, extensionSupported, userId]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(
        CHROME_EXTENSION_PROMPT_DISMISSED_KEY,
        "1",
      );
    } catch {
      // Keep the prompt dismissed for this page even when storage is blocked.
    }
    setDismissed(true);
  };

  if (!visible) return null;

  return (
    <aside
      aria-label="Chrome extension suggestion"
      className="app-surface fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-sm overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--app-primary)_24%,transparent)] p-4 shadow-[0_20px_55px_-22px_rgba(29,34,48,0.48)] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:mx-0 sm:w-[22rem]"
    >
      <button
        type="button"
        onClick={dismiss}
        className="theme-button-icon absolute right-2.5 top-2.5 inline-flex size-10"
        aria-label="Dismiss Chrome extension suggestion"
      >
        <X size={17} aria-hidden="true" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--app-primary)_13%,transparent)] text-[var(--app-primary)]">
          <Puzzle size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-[var(--app-ink)]">
            Get more from FavLock in Chrome
          </p>
          <p className="mt-1 text-sm leading-5 text-[var(--app-muted)]">
            Save pages and articles, organize them as you go, and import your
            existing Chrome bookmarks.
          </p>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          href={CHROME_EXTENSION_URL}
          target="_blank"
          rel="noreferrer noopener"
          color="emerald"
        >
          Get Chrome extension
          <ExternalLink data-slot="icon" aria-hidden="true" />
        </Button>
      </div>
    </aside>
  );
}
