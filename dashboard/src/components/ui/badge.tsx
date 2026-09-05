import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import React, { forwardRef } from 'react'
import { TouchTarget } from './button'
import { Link } from './link'

const colors = {
  'collection-neutral': 'bg-[var(--app-reading)] text-[var(--app-muted)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--app-muted)_25%,var(--app-reading))] group-data-hover:bg-[var(--app-mint)]',
  'collection-red': 'bg-[#fbe9ed] text-[#803b49] ring-1 ring-inset ring-[#edbbc5] group-data-hover:bg-[#f5d8df]',
  'collection-orange': 'bg-[#fff0e8] text-[#804c32] ring-1 ring-inset ring-[#efc5ac] group-data-hover:bg-[#f8e0d1]',
  'collection-yellow': 'bg-[#fff2da] text-[#725720] ring-1 ring-inset ring-[#ead498] group-data-hover:bg-[#f5e5bb]',
  'collection-green': 'bg-[#eef8ef] text-[#386347] ring-1 ring-inset ring-[#b4d8bf] group-data-hover:bg-[#dceee1]',
  'collection-cyan': 'bg-[#eef8f4] text-[#306863] ring-1 ring-inset ring-[#add9d4] group-data-hover:bg-[#d9eeea]',
  'collection-blue': 'bg-[#edf6fb] text-[#3c5e7e] ring-1 ring-inset ring-[#b8d1ea] group-data-hover:bg-[#dcebf6]',
  'collection-purple': 'bg-[#f3edf9] text-[#65477e] ring-1 ring-inset ring-[#d0bde6] group-data-hover:bg-[#e8ddf2]',
  'collection-pink': 'bg-[#fbeef5] text-[#7e4565] ring-1 ring-inset ring-[#eac0d7] group-data-hover:bg-[#f3dfea]',
  red: 'bg-red-500/15 text-red-700 group-data-hover:bg-red-500/25   ',
  orange:
    'bg-orange-500/15 text-orange-700 group-data-hover:bg-orange-500/25   ',
  amber:
    'bg-amber-400/20 text-amber-700 group-data-hover:bg-amber-400/30   ',
  yellow:
    'bg-yellow-400/20 text-yellow-700 group-data-hover:bg-yellow-400/30   ',
  lime: 'bg-lime-400/20 text-lime-700 group-data-hover:bg-lime-400/30   ',
  green:
    'bg-green-500/15 text-green-700 group-data-hover:bg-green-500/25   ',
  emerald:
    'bg-emerald-500/15 text-emerald-700 group-data-hover:bg-emerald-500/25   ',
  teal: 'bg-teal-500/15 text-teal-700 group-data-hover:bg-teal-500/25   ',
  cyan: 'bg-cyan-400/20 text-cyan-700 group-data-hover:bg-cyan-400/30   ',
  sky: 'bg-sky-500/15 text-sky-700 group-data-hover:bg-sky-500/25   ',
  blue: 'bg-blue-500/15 text-blue-700 group-data-hover:bg-blue-500/25  ',
  indigo:
    'bg-indigo-500/15 text-indigo-700 group-data-hover:bg-indigo-500/25  ',
  violet:
    'bg-violet-500/15 text-violet-700 group-data-hover:bg-violet-500/25  ',
  purple:
    'bg-purple-500/15 text-purple-700 group-data-hover:bg-purple-500/25  ',
  fuchsia:
    'bg-fuchsia-400/15 text-fuchsia-700 group-data-hover:bg-fuchsia-400/25   ',
  pink: 'bg-pink-400/15 text-pink-700 group-data-hover:bg-pink-400/25   ',
  rose: 'bg-rose-400/15 text-rose-700 group-data-hover:bg-rose-400/25   ',
  zinc: 'bg-zinc-600/10 text-zinc-700 group-data-hover:bg-zinc-600/20   ',
}

type BadgeProps = { color?: keyof typeof colors }

export function Badge({ color = 'zinc', className, ...props }: BadgeProps & React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      {...props}
      className={clsx(
        className,
        'inline-flex items-center gap-x-1.5 px-1.5 py-0.5 text-sm/5 font-medium sm:text-sm/5 forced-colors:outline',
        color.startsWith('collection-') ? 'rounded-full' : 'rounded-md',
        colors[color]
      )}
    />
  )
}

export const BadgeButton = forwardRef(function BadgeButton(
  {
    color = 'zinc',
    className,
    children,
    ...props
  }: BadgeProps & { className?: string; children: React.ReactNode } & (
      | ({ href?: never } & Omit<Headless.ButtonProps, 'as' | 'className'>)
      | ({ href: string } & Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'>)
    ),
  ref: React.ForwardedRef<HTMLElement>
) {
  const classes = clsx(
    className,
    color.startsWith('collection-') ? 'rounded-full' : 'rounded-md',
    'group relative inline-flex focus:not-data-focus:outline-hidden data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-blue-500'
  )

  return typeof props.href === 'string' ? (
    <Link {...props} className={classes} ref={ref as React.ForwardedRef<HTMLAnchorElement>}>
      <TouchTarget>
        <Badge color={color} className="min-w-0 max-w-full">{children}</Badge>
      </TouchTarget>
    </Link>
  ) : (
    <Headless.Button {...props} className={classes} ref={ref}>
      <TouchTarget>
        <Badge color={color} className="min-w-0 max-w-full">{children}</Badge>
      </TouchTarget>
    </Headless.Button>
  )
})
