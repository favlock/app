import type { SVGProps } from "react";

/**
 * FavLock's bookmark and keyhole in one compact mark.
 *
 * The color fallbacks let the logo inherit the dashboard's active palette,
 * the marketing site's palette, or sensible brand defaults when used alone.
 */
export function Logo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="184"
      height="44"
      viewBox="0 0 184 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="FavLock"
      role="img"
      focusable="false"
      {...props}
    >
      {/* The offset silhouette echoes the app's raised cards and buttons. */}
      <path
        d="M12 5h24a6 6 0 0 1 6 6v28.18a2 2 0 0 1-3.03 1.72L24 32.08 9.03 40.9A2 2 0 0 1 6 39.18V11a6 6 0 0 1 6-6Z"
        fill="var(--logo-ink, var(--app-line, var(--line, #1d2230)))"
        opacity="0.18"
      />

      {/* Bookmark body. */}
      <path
        d="M12 2h22a6 6 0 0 1 6 6v27.18a2 2 0 0 1-3.03 1.72L23 28.66 9.03 36.9A2 2 0 0 1 6 35.18V8a6 6 0 0 1 6-6Z"
        fill="var(--logo-primary, var(--app-primary, var(--primary, #0f766e)))"
        stroke="var(--logo-ink, var(--app-line, var(--line, #1d2230)))"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* The warm accent doubles as the lock face. */}
      <circle
        cx="23"
        cy="16"
        r="8"
        fill="var(--logo-accent, var(--app-accent, var(--secondary, #f59e0b)))"
        stroke="var(--logo-ink, var(--app-line, var(--line, #1d2230)))"
        strokeWidth="1.75"
      />
      <path
        d="M23 12.25a2.5 2.5 0 0 0-1.38 4.59l-1.12 3.41h5l-1.12-3.41A2.5 2.5 0 0 0 23 12.25Z"
        fill="var(--logo-ink, var(--app-line, var(--line, #1d2230)))"
      />

      {/* A friendly geometric wordmark, with Lock carrying the brand color. */}
      <text
        x="51"
        y="29.5"
        fill="var(--logo-ink, var(--app-ink, var(--ink, #202229)))"
        fontFamily="'Space Grotesk', 'Avenir Next', 'Segoe UI', sans-serif"
        fontSize="25.5"
        fontWeight="650"
        letterSpacing="-1.15"
      >
        Fav
      </text>
      <text
        x="94"
        y="29.5"
        fill="var(--logo-primary, var(--app-primary, var(--primary, #0f766e)))"
        fontFamily="'Space Grotesk', 'Avenir Next', 'Segoe UI', sans-serif"
        fontSize="25.5"
        fontWeight="800"
        letterSpacing="-1.15"
      >
        Lock
      </text>
    </svg>
  );
}
