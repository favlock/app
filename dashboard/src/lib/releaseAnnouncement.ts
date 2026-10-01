import type { Release } from "../data/changelog";

export const RELEASE_ANNOUNCEMENT_SEEN_KEY =
  "favlock.release-announcement.seen.v1";

export function getAnnounceableReleaseSeries(version: string): string | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;

  return `${Number(match[1])}.${Number(match[2])}`;
}

export function getReleaseAnnouncementContent(
  release: Release,
  releases: readonly Release[],
): Release {
  const series = getAnnounceableReleaseSeries(release.version);
  return releases.find((entry) => entry.version === `${series}.0`) ?? release;
}

export function readSeenReleaseSeries(): string | null {
  try {
    const seen = window.localStorage.getItem(RELEASE_ANNOUNCEMENT_SEEN_KEY);
    if (!seen) return null;
    return getAnnounceableReleaseSeries(seen) ??
      (/^\d+\.\d+$/.test(seen) ? seen : null);
  } catch {
    return null;
  }
}

export function saveSeenReleaseSeries(series: string): void {
  try {
    window.localStorage.setItem(
      RELEASE_ANNOUNCEMENT_SEEN_KEY,
      series,
    );
  } catch {
    // The in-memory dialog state still prevents repeated prompts on this page.
  }
}
