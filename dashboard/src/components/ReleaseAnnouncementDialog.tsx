import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { changelog, type Release } from "../data/changelog";
import {
  getAnnounceableReleaseSeries,
  readSeenReleaseSeries,
  saveSeenReleaseSeries,
} from "../lib/releaseAnnouncement";
import { CHROME_EXTENSION_URL } from "../lib/appUrls";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

interface ReleaseAnnouncementDialogProps {
  enabled: boolean;
  release?: Release;
}

function ReleaseHighlight({ text }: { text: string }) {
  return text.split(/(Chrome extension)/gi).map((part, index) =>
    part.toLowerCase() === "chrome extension" ? (
      <a
        key={`${part}-${index}`}
        href={CHROME_EXTENSION_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="rounded-sm font-semibold text-[var(--app-primary)] underline decoration-[color-mix(in_oklab,var(--app-primary)_35%,transparent)] underline-offset-2 transition-colors hover:decoration-[var(--app-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-primary)_25%,transparent)]"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

export default function ReleaseAnnouncementDialog({
  enabled,
  release = changelog[0],
}: ReleaseAnnouncementDialogProps) {
  const [seenReleaseSeries, setSeenReleaseSeries] = useState(
    readSeenReleaseSeries,
  );
  const releaseSeries = release
    ? getAnnounceableReleaseSeries(release.version)
    : null;
  const open = Boolean(
    enabled && release && releaseSeries && seenReleaseSeries !== releaseSeries,
  );

  const dismiss = () => {
    if (!releaseSeries) return;

    saveSeenReleaseSeries(releaseSeries);
    setSeenReleaseSeries(releaseSeries);
  };

  if (!release || !releaseSeries) return null;

  return (
    <Dialog open={open} onClose={dismiss} size="md">
      <div className="relative">
        <button
          type="button"
          onClick={dismiss}
          className="theme-button-icon absolute -right-3 -top-3 inline-flex size-9"
          aria-label="Dismiss release announcement"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="pr-10">
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.15em] text-[var(--app-primary)]">
            <Sparkles className="size-4" aria-hidden="true" />
            New in version {release.version}
          </p>
          <DialogTitle>What’s new in FavLock</DialogTitle>
          <DialogDescription>{release.date}</DialogDescription>
        </div>

        <DialogBody>
          <p className="text-sm leading-6 text-[var(--app-muted)]">
            FavLock has been updated with new features and improvements across
            the app.
          </p>
          {release.announcementHighlights?.length ? (
            <ul className="mt-4 space-y-2.5">
              {release.announcementHighlights.map((highlight) => (
                <li
                  key={highlight}
                  className="flex items-start gap-3 text-sm leading-6 text-[var(--app-muted)]"
                >
                  <span
                    className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[var(--app-primary)]"
                    aria-hidden="true"
                  />
                  <span>
                    <ReleaseHighlight text={highlight} />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <a
            href="/support#changelog"
            onClick={dismiss}
            className="mt-3 inline-flex rounded-sm text-sm font-semibold text-[var(--app-primary)] underline decoration-[color-mix(in_oklab,var(--app-primary)_35%,transparent)] underline-offset-2 transition-colors hover:decoration-[var(--app-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-primary)_25%,transparent)]"
          >
            View full changelog
          </a>
        </DialogBody>

        <DialogActions>
          <Button
            type="button"
            color="emerald"
            className="px-6! sm:px-6!"
            onClick={dismiss}
          >
            Got it
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}
