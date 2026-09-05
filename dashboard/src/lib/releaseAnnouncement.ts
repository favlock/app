export const RELEASE_ANNOUNCEMENT_SEEN_KEY =
  "favlock.release-announcement.seen.v1";

export function getAnnounceableReleaseSeries(version: string): string | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match || Number(match[3]) !== 0) return null;

  return `${Number(match[1])}.${Number(match[2])}`;
}

export function readSeenReleaseSeries(): string | null {
  try {
    return window.localStorage.getItem(RELEASE_ANNOUNCEMENT_SEEN_KEY);
  } catch {
    return null;
  }
}

export function saveSeenReleaseSeries(releaseSeries: string): void {
  try {
    window.localStorage.setItem(
      RELEASE_ANNOUNCEMENT_SEEN_KEY,
      releaseSeries,
    );
  } catch {
    // The in-memory dialog state still prevents repeated prompts on this page.
  }
}
