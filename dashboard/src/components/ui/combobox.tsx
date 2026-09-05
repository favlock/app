"use client";

import * as Headless from "@headlessui/react";
import clsx from "clsx";
import { useState } from "react";

export function Combobox<T>({
  options,
  displayValue,
  filter,
  anchor = "bottom",
  className,
  placeholder,
  autoFocus,
  "aria-label": ariaLabel,
  children,
  onQueryChange,
  onInputKeyDown,
  ...props
}: {
  options: T[];
  displayValue: (value: T | null) => string | undefined;
  filter?: (value: T, query: string) => boolean;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
  children: (value: NonNullable<T>) => React.ReactElement;
  onQueryChange?: (query: string) => void;
  onInputKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
} & Omit<Headless.ComboboxProps<T, false>, "as" | "multiple" | "children"> & {
    anchor?: "top" | "bottom";
  }) {
  const [query, setQuery] = useState("");

  const filteredOptions =
    query === ""
      ? options
      : options.filter((option) =>
          filter
            ? filter(option, query)
            : displayValue(option)?.toLowerCase().includes(query.toLowerCase()),
        );

  return (
    <Headless.Combobox
      {...props}
      multiple={false}
      virtual={{ options: filteredOptions }}
      onClose={() => setQuery("")}
    >
      <span
        data-slot="control"
        className={clsx([
          className,
          "app-combobox relative block w-full self-start has-data-disabled:opacity-50",
        ])}
      >
        <Headless.ComboboxInput
          autoFocus={autoFocus}
          data-slot="control"
          aria-label={ariaLabel}
          displayValue={(option: T) => displayValue(option) ?? ""}
          onChange={(event) => {
            setQuery(event.target.value);
            onQueryChange?.(event.target.value);
          }}
          onKeyDown={onInputKeyDown}
          placeholder={placeholder}
          className={clsx([
            // Basic layout
            "app-combobox-input relative block min-h-11 w-full appearance-none rounded-xl py-[calc(--spacing(2.5)-1px)] sm:py-[calc(--spacing(1.5)-1px)]",
            // Horizontal padding
            "pr-[calc(--spacing(10)-1px)] pl-[calc(--spacing(3.5)-1px)] sm:pr-[calc(--spacing(9)-1px)] sm:pl-[calc(--spacing(3)-1px)]",
            // Typography
            "text-base/6 text-[var(--app-ink)] placeholder:text-zinc-500 placeholder:dark:text-[var(--app-muted)] sm:text-sm/6 ",
            // Border
            "border border-zinc-950/10 dark:border-[var(--app-line)]/10 data-hover:border-zinc-950/20 data-hover:dark:border-[var(--app-line)]/20  ",
            // Background color
            "bg-[var(--app-reading)] ",
            // Hide default focus styles
            "focus:outline-hidden",
            // Invalid state
            "data-invalid:border-red-500 data-invalid:data-hover:border-red-500  ",
            // Disabled state
            "data-disabled:border-zinc-950/20 data-disabled:dark:border-[var(--app-line)]/20   ",
            // System icons
            "",
          ])}
        />
        <Headless.ComboboxButton aria-label={ariaLabel ? `Show options for ${ariaLabel}` : "Show options"} className="group absolute inset-y-0 right-0 flex items-center px-2">
          <svg
            className="size-5 stroke-zinc-500 group-data-disabled:stroke-zinc-600 group-data-hover:stroke-zinc-700 sm:size-4   forced-colors:stroke-[CanvasText]"
            viewBox="0 0 16 16"
            aria-hidden="true"
            fill="none"
          >
            <path
              d="M5.75 10.75L8 13L10.25 10.75"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10.25 5.25L8 3L5.75 5.25"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Headless.ComboboxButton>
      </span>
      <Headless.ComboboxOptions
        portal
        transition
        anchor={anchor}
        className={clsx(
          // Anchor positioning
          "[--anchor-gap:--spacing(2)] [--anchor-padding:--spacing(4)] sm:data-[anchor~=start]:[--anchor-offset:-4px]",
          // Base styles,
          "app-popup-surface isolate z-[60] min-w-[calc(var(--input-width)+8px)] scroll-py-1 p-1 select-none empty:invisible",
          // Invisible border that is only visible in `forced-colors` mode for accessibility purposes
          "outline outline-transparent focus:outline-hidden",
          // Handle scrolling when menu won't fit in viewport
          "overflow-y-scroll overscroll-contain",
          // Transitions
          "transition-opacity duration-100 ease-in data-closed:data-leave:opacity-0 data-transition:pointer-events-none",
        )}
      >
        {({ option }) => children(option)}
      </Headless.ComboboxOptions>
    </Headless.Combobox>
  );
}

export function ComboboxOption<T>({
  children,
  className,
  ...props
}: { className?: string; children?: React.ReactNode } & Omit<
  Headless.ComboboxOptionProps<"div", T>,
  "as" | "className"
>) {
  const sharedClasses = clsx(
    // Base
    "flex min-w-0 items-center",
    // Icons
    "*:data-[slot=icon]:size-5 *:data-[slot=icon]:shrink-0 sm:*:data-[slot=icon]:size-4",
    "*:data-[slot=icon]:text-zinc-500 group-data-focus/option:*:data-[slot=icon]:text-[var(--app-on-primary)] ",
    "forced-colors:*:data-[slot=icon]:text-[CanvasText] forced-colors:group-data-focus/option:*:data-[slot=icon]:text-[Canvas]",
    // Avatars
    "*:data-[slot=avatar]:-mx-0.5 *:data-[slot=avatar]:size-6 sm:*:data-[slot=avatar]:size-5",
  );

  return (
    <Headless.ComboboxOption
      {...props}
      className={clsx(
        // Basic layout
        "app-popup-item group/option grid w-full cursor-default grid-cols-[1fr_--spacing(5)] items-baseline gap-x-2 py-2.5 pr-2 pl-3.5 sm:grid-cols-[1fr_--spacing(4)] sm:py-1.5 sm:pr-2 sm:pl-3",
        // Typography
        "text-base/6 text-[var(--app-ink)] sm:text-sm/6  forced-colors:text-[CanvasText]",
        // Focus
        "outline-hidden data-focus:bg-[var(--app-primary)] data-focus:text-[var(--app-on-primary)]",
        // Forced colors mode
        "forced-color-adjust-none forced-colors:data-focus:bg-[Highlight] forced-colors:data-focus:text-[HighlightText]",
        // Disabled
        "data-disabled:opacity-50",
      )}
    >
      <span className={clsx(className, sharedClasses)}>{children}</span>
      <svg
        className="relative col-start-2 hidden size-5 self-center stroke-current group-data-selected/option:inline sm:size-4"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 8.5l3 3L12 4"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Headless.ComboboxOption>
  );
}

export function ComboboxLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span">) {
  return (
    <span
      {...props}
      className={clsx(
        className,
        "ml-2.5 truncate first:ml-0 sm:ml-2 sm:first:ml-0",
      )}
    />
  );
}

export function ComboboxDescription({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"span">) {
  return (
    <span
      {...props}
      className={clsx(
        className,
        "flex flex-1 overflow-hidden text-[var(--app-muted)] group-data-focus/option:text-[var(--app-on-primary)] before:w-2 before:min-w-0 before:shrink ",
      )}
    >
      <span className="flex-1 truncate">{children}</span>
    </span>
  );
}
