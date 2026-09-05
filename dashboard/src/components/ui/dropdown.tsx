"use client";

import * as Headless from "@headlessui/react";
import clsx from "clsx";
import { ChevronsUpDown } from "lucide-react";
import type React from "react";
import { Button } from "./button";
import { Link } from "./link";

export function Dropdown(props: Headless.MenuProps) {
  return <Headless.Menu {...props} />;
}

export function DropdownButton<T extends React.ElementType = typeof Button>({
  as = Button,
  ...props
}: { className?: string } & Omit<Headless.MenuButtonProps<T>, "className">) {
  return <Headless.MenuButton as={as} {...props} />;
}

export function DropdownFieldButton({
  children,
  className,
  ...props
}: { children: React.ReactNode; className?: string } & Omit<
  Headless.MenuButtonProps<"button">,
  "as" | "className" | "children"
>) {
  return (
    <Headless.MenuButton
      {...props}
      className={clsx(
        "flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_15%,transparent)] bg-[var(--app-reading)] px-3 text-left text-base/6 font-normal text-[var(--app-ink)] data-hover:border-[color-mix(in_oklab,var(--app-line)_30%,transparent)] data-focus:outline-3 data-focus:outline-offset-2 data-focus:outline-[var(--app-primary)] data-disabled:cursor-not-allowed data-disabled:opacity-50 sm:text-sm/6",
        className,
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
      <ChevronsUpDown className="size-4 shrink-0 text-[var(--app-muted)]" aria-hidden="true" />
    </Headless.MenuButton>
  );
}

export function DropdownMenu({
  anchor = "bottom",
  className,
  ...props
}: { className?: string } & Omit<Headless.MenuItemsProps, "as" | "className">) {
  return (
    <Headless.MenuItems
      {...props}
      transition
      anchor={anchor}
      className={clsx(
        className,
        // Anchor positioning
        "[--anchor-gap:--spacing(2)] [--anchor-padding:--spacing(1)] data-[anchor~=end]:[--anchor-offset:6px] data-[anchor~=start]:[--anchor-offset:-6px] sm:data-[anchor~=end]:[--anchor-offset:4px] sm:data-[anchor~=start]:[--anchor-offset:-4px]",
        // Base styles
        "app-popup-surface isolate z-[60] w-max p-1",
        // Invisible border that is only visible in `forced-colors` mode for accessibility purposes
        "outline outline-transparent focus:outline-hidden",
        // Handle scrolling when menu won't fit in viewport
        "overflow-y-auto",
        // Define grid at the menu level if subgrid is supported
        "supports-[grid-template-columns:subgrid]:grid supports-[grid-template-columns:subgrid]:grid-cols-[auto_1fr_1.5rem_0.5rem_auto]",
        // Transitions
        "transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0",
      )}
    />
  );
}

export function DropdownItem({
  className,
  ...props
}: { className?: string } & (
  | ({ href?: never } & Omit<
      Headless.MenuItemProps<"button">,
      "as" | "className"
    >)
  | ({ href: string } & Omit<
      Headless.MenuItemProps<typeof Link>,
      "as" | "className"
    >)
)) {
  const classes = clsx(
    className,
    // Base styles
    "app-popup-item group cursor-pointer px-3.5 py-2.5 focus:outline-hidden sm:px-3 sm:py-1.5",
    // Text styles
    "text-left text-base/6 text-[var(--app-ink)] sm:text-sm/6 forced-colors:text-[CanvasText]",
    // Focus
    "data-focus:bg-[var(--app-primary)] data-focus:text-white",
    // Disabled state
    "data-disabled:opacity-50",
    // Forced colors mode
    "forced-color-adjust-none forced-colors:data-focus:bg-[Highlight] forced-colors:data-focus:text-[HighlightText] forced-colors:data-focus:*:data-[slot=icon]:text-[HighlightText]",
    // Use subgrid when available but fallback to an explicit grid layout if not
    "col-span-full grid grid-cols-[auto_1fr_1.5rem_0.5rem_auto] items-center supports-[grid-template-columns:subgrid]:grid-cols-subgrid",
    // Icons
    "*:data-[slot=icon]:col-start-1 *:data-[slot=icon]:row-start-1 *:data-[slot=icon]:mr-2.5 *:data-[slot=icon]:-ml-0.5 *:data-[slot=icon]:size-5 sm:*:data-[slot=icon]:mr-2 sm:*:data-[slot=icon]:size-4",
    "*:data-[slot=icon]:text-[var(--app-muted)] data-focus:*:data-[slot=icon]:text-white",
    // Avatar
    "*:data-[slot=avatar]:mr-2.5 *:data-[slot=avatar]:-ml-1 *:data-[slot=avatar]:size-6 sm:*:data-[slot=avatar]:mr-2 sm:*:data-[slot=avatar]:size-5",
  );

  return typeof props.href === "string" ? (
    <Headless.MenuItem as={Link} {...props} className={classes} />
  ) : (
    <Headless.MenuItem
      as="button"
      type="button"
      {...props}
      className={classes}
    />
  );
}

export function DropdownHeader({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...props}
      className={clsx(className, "col-span-5 px-3.5 pt-2.5 pb-1 sm:px-3")}
    />
  );
}

export function DropdownSection({
  className,
  ...props
}: { className?: string } & Omit<
  Headless.MenuSectionProps,
  "as" | "className"
>) {
  return (
    <Headless.MenuSection
      {...props}
      className={clsx(
        className,
        // Define grid at the section level instead of the item level if subgrid is supported
        "col-span-full supports-[grid-template-columns:subgrid]:grid supports-[grid-template-columns:subgrid]:grid-cols-[auto_1fr_1.5rem_0.5rem_auto]",
      )}
    />
  );
}

export function DropdownHeading({
  className,
  ...props
}: { className?: string } & Omit<
  Headless.MenuHeadingProps,
  "as" | "className"
>) {
  return (
    <Headless.MenuHeading
      {...props}
      className={clsx(
        className,
        "col-span-full grid grid-cols-[1fr_auto] gap-x-12 px-3.5 pt-2 pb-1 text-sm/5 font-medium text-zinc-500 sm:px-3 sm:text-sm/5 ",
      )}
    />
  );
}

export function DropdownDivider({
  className,
  ...props
}: { className?: string } & Omit<
  Headless.MenuSeparatorProps,
  "as" | "className"
>) {
  return (
    <Headless.MenuSeparator
      {...props}
      className={clsx(
        className,
        "col-span-full mx-3.5 my-1 h-px border-0 bg-zinc-950/5 sm:mx-3  forced-colors:bg-[CanvasText]",
      )}
    />
  );
}

export function DropdownLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...props}
      data-slot="label"
      className={clsx(className, "col-start-2 row-start-1")}
      {...props}
    />
  );
}

export function DropdownDescription({
  className,
  ...props
}: { className?: string } & Omit<
  Headless.DescriptionProps,
  "as" | "className"
>) {
  return (
    <Headless.Description
      data-slot="description"
      {...props}
      className={clsx(
        className,
        "col-span-2 col-start-2 row-start-2 text-sm/5 text-zinc-500 group-data-focus:text-white sm:text-sm/5  forced-colors:group-data-focus:text-[HighlightText]",
      )}
    />
  );
}

export function DropdownShortcut({
  keys,
  className,
  ...props
}: { keys: string | string[]; className?: string } & Omit<
  Headless.DescriptionProps<"kbd">,
  "as" | "className"
>) {
  return (
    <Headless.Description
      as="kbd"
      {...props}
      className={clsx(
        className,
        "col-start-5 row-start-1 flex justify-self-end",
      )}
    >
      {(Array.isArray(keys) ? keys : keys.split("")).map((char, index) => (
        <kbd
          key={index}
          className={clsx([
            "min-w-[2ch] text-center font-sans text-zinc-400 capitalize group-data-focus:text-white forced-colors:group-data-focus:text-[HighlightText]",
            // Make sure key names that are longer than one character (like "Tab") have extra space
            index > 0 && char.length > 1 && "pl-1",
          ])}
        >
          {char}
        </kbd>
      ))}
    </Headless.Description>
  );
}
