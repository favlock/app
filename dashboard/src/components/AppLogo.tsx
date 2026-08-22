import { Logo } from "@favlock/shared";
import type { ComponentProps } from "react";

type AppLogoProps = ComponentProps<typeof Logo>;

export function AppLogo({ className, ...props }: AppLogoProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <Logo className={className} {...props} />
      {import.meta.env.DEV ? (
        <span
          className="inline-flex rounded-md border border-amber-600/30 bg-amber-400/15 px-1.5 py-1 text-[0.625rem] font-extrabold leading-none tracking-[0.08em] text-amber-800"
          aria-label="Development build"
          title="Development build"
        >
          DEV
        </span>
      ) : null}
    </span>
  );
}
