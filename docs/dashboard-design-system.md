# Dashboard design system

The dashboard shares the marketing website’s warm, pastel character while
keeping compact navigation and familiar library interactions.

## Foundations

`dashboard/src/index.css` owns the shared tokens and component styles.
Use Avenir Next with the system fallbacks in `--font-sans`, dark readable ink,
a warm cream canvas, and teal primary actions. Settings → Preferences offers Light, Dark, and Auto. Auto is the default and
follows device appearance changes. The choice is saved per browser under
`favlock.appearance` and applied before React renders. Dark mode uses soft charcoal
surfaces with muted pastel fills and light ink. Use `--app-highlight` for blended
surface highlights and `--app-on-primary` for text on primary actions.
Legacy account theme variants remain unchanged for API compatibility.

Pastels are decorative sibling surfaces, not status colors:

| Surface | Fill | Border |
| --- | --- | --- |
| Mint | `#eef8f4` | `#a6d6cb` |
| Lavender | `#f3edf9` | `#cdbce2` |
| Peach | `#fff0e8` | `#e6bdab` |
| Butter | `#fff2da` | `#e8c88e` |
| Sky | `#edf6fb` | `#bad4e5` |

Use the `--app-*` pastel tokens instead of introducing more hardcoded colors.
Keep long reading surfaces quiet. Preserve explicit error and warning labels.

## Shared components

- `LibraryCard` uses a 1.5rem radius, one-pixel pastel border, and no resting
  shadow. Card fill and border follow the collection’s pastel color, regardless of
  sorting or item type. Unassigned and uncolored collections use neutral cream.
  Type badges retain text and icons.
- The library navigation uses pastel icon backgrounds and a distinct primary
  active state. Collections retain their user-selected colors.
- Primary `Button` actions are pill shaped with at least 44px height. Their
  background layers follow the same radius. Standalone secondary actions also
  use a pill; compact controls follow the radius rules below.
- `app-surface`, `retro-panel`, and `app-sidebar` provide warm neutral surfaces.
  Keep shadows subtle and reserve them for separation rather than decoration.

## Radius rules

Apply these rules to new or changed dashboard UI. Choose corners by component
role, not by color, action priority, or individual page preference.

| Element | Radius | Rule |
| --- | --- | --- |
| Text inputs, password fields, selects, textareas | `0.75rem` (12px at the default root size) | Soft rectangle; never a pill for multiline fields |
| Standalone text action buttons | `999px` | Pill shape for primary, secondary, outline, and social sign-in actions |
| Compact toolbar and navigation controls | `0.75rem` | Soft rectangle; use the same shape for sibling controls |
| Standalone icon-only actions | `50%` on a square control | Circle; compact toolbar icons follow their toolbar shape |
| Segmented-control track | `1rem` | Derive each segment’s radius from the track inset |
| Small supporting panels and menus | `1rem` | Consistent outer surface |
| Content cards | `1.5rem` | Includes library cards and corresponding skeletons |
| Large form panels and dialogs | `1.75rem` | Includes the authentication panel |
| Short badges and chips | `999px` | Keep the same shape in selected and unselected states |
| Inline code and text highlights | `0.25rem` | Small text decoration, not a control |

Pixel equivalents assume a 16px root font size; use rem for the fixed scale.
Existing specialized controls, such as square checkboxes and borderless document
editors, retain the geometry required by their interaction. Explain a new
exception in the shared component or this document; do not scatter one-off
radius overrides through call sites.

### Nested corners

When an inner surface follows an outer surface, its curve must follow the same
inset. Measure from the outer border edge to the inner border edge:

`inner radius = max(0px, outer radius - outer border width - inner gap)`

For example, a 16px segmented track with a 1px border and 4px padding needs an
11px segment radius, not the unrelated 8px control default. Express this with
shared custom properties on the component:

```css
.segmented-control {
  --track-radius: 1rem;
  --track-border: 1px;
  --track-gap: .25rem;
  border: var(--track-border) solid var(--app-mint-border);
  border-radius: var(--track-radius);
  padding: var(--track-gap);
}

.segmented-control > [role="tab"] {
  border-radius: max(0px, calc(
    var(--track-radius) - var(--track-border) - var(--track-gap)
  ));
}
```

Apply this formula to surfaces that visibly trace the parent’s corners, not to
every button or card placed somewhere inside a larger panel. Independent child
controls keep the radius assigned to their own role. For asymmetric padding,
check the affected corners individually rather than assuming one uniform inset.

### Layers, states, and consistency

- Backgrounds, borders, hover overlays, and focus layers on the same bounds must
  share the control’s radius. Use `border-radius: inherit` for co-located layers.
  Inset layers use the nested-corner formula; do not hardcode a smaller utility.
- Hover, focus, selected, loading, error, and disabled states must not change the
  radius or control dimensions. All segments use the derived inner radius,
  including unselected segments when hovered.
- Email, Google, Apple, and local-trial actions in the authentication flow share
  the pill shape. Their colors may distinguish priority; their corners should
  not imply different interaction patterns.
- Own radius styling in shared components or component-scoped CSS. Prefer one
  source of truth over competing Tailwind classes and `!important` overrides.
- Keep focus outlines visible outside the rounded edge. Do not add
  `overflow: hidden` to a control group merely to mask incorrect corners; it can
  clip focus indicators and menus.
- Verify the outer and inner curves at desktop and mobile sizes, including
  keyboard focus, selected states, and browser zoom. Preserve touch-target size
  independently of corner styling.

## Authentication

`AuthLayout` uses the cream canvas and a mint panel for sign-in, signup, email
confirmation, and password reset. Lavender accents use the same pastel tokens. Email tabs use a quiet cream
track and a mint selected state. Inputs have warm reading surfaces and teal focus
outlines; provider buttons retain their recognizable artwork and white surface.

## Popups

- `Dialog` and `Alert` use `app-dialog-surface`: cream reading fill, mint border,
  1.75rem corners, dark ink, and a shared soft shadow and backdrop. Normal
  dialogs become bottom sheets on phones; centered alerts retain all four
  rounded corners. Full-screen writing mode has square viewport edges.
- Dialog action rows use pill-shaped buttons. Form controls have 0.75rem
  corners, at least 44px height, and teal focus outlines. Error and destructive
  action colors keep their existing meanings.
- `DropdownMenu`, listbox and combobox options, collection menus, search history,
  and the article selection popover use `app-popup-surface`: cream fill, mint
  border, 1rem corners, and a smaller floating shadow. Menu items derive their
  radius from the surface radius, border, and padding. Focused options use teal.
- Bookmark and writing headers use mint. Long article and document content stays
  on a quiet cream surface. Preserve scrolling, focus management, portal
  positioning, dismissal, and safe-area behavior when changing these surfaces.
- Browser-native confirmation prompts are controlled by the browser and cannot
  inherit app CSS. Replacing them requires a separate interaction change.

## Interaction and validation

Use short color transitions, visible keyboard focus, and the existing reduced
motion rules. Do not introduce continuous decorative animation into the library.
Keep disabled navigation inert. Check desktop and phone layouts, mobile drawer
scrolling and dismissal, long titles, focus visibility, and mixed library cards.

For dashboard changes run `npm test`, `npm run lint`, `npm run build`, and
`git diff --check`. Validate the actual UI in a browser as well as source checks.
