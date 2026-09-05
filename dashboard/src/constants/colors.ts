// Color constants
export const COLOR_NONE = "NONE";
export const COLOR_RED = "RED";
export const COLOR_ORANGE = "ORANGE";
export const COLOR_YELLOW = "YELLOW";
export const COLOR_GREEN = "GREEN";
export const COLOR_CYAN = "CYAN";
export const COLOR_BLUE = "BLUE";
export const COLOR_PURPLE = "PURPLE";
export const COLOR_PINK = "PINK";

// Color constant type
export type ColorConstant =
  | typeof COLOR_NONE
  | typeof COLOR_RED
  | typeof COLOR_ORANGE
  | typeof COLOR_YELLOW
  | typeof COLOR_GREEN
  | typeof COLOR_CYAN
  | typeof COLOR_BLUE
  | typeof COLOR_PURPLE
  | typeof COLOR_PINK;

// Pastel collection swatches. Stored color identifiers remain unchanged.
export const COLOR_MAP: Record<ColorConstant, string> = {
  [COLOR_NONE]: "var(--app-line)",
  [COLOR_RED]: "#edbbc5",
  [COLOR_ORANGE]: "#efc5ac",
  [COLOR_YELLOW]: "#ead498",
  [COLOR_GREEN]: "#b4d8bf",
  [COLOR_CYAN]: "#add9d4",
  [COLOR_BLUE]: "#b8d1ea",
  [COLOR_PURPLE]: "#d0bde6",
  [COLOR_PINK]: "#eac0d7",
};

export const COLLECTION_BADGE_COLOR_MAP = {
  [COLOR_NONE]: "collection-neutral",
  [COLOR_RED]: "collection-red",
  [COLOR_ORANGE]: "collection-orange",
  [COLOR_YELLOW]: "collection-yellow",
  [COLOR_GREEN]: "collection-green",
  [COLOR_CYAN]: "collection-cyan",
  [COLOR_BLUE]: "collection-blue",
  [COLOR_PURPLE]: "collection-purple",
  [COLOR_PINK]: "collection-pink",
} as const;

export function getCollectionBadgeColor(
  color: ColorConstant | null | undefined,
): (typeof COLLECTION_BADGE_COLOR_MAP)[ColorConstant] {
  return color ? (COLLECTION_BADGE_COLOR_MAP[color] ?? "collection-neutral") : "collection-neutral";
}

// Preset colors array
export const PRESET_COLORS: ColorConstant[] = [
  COLOR_NONE,
  COLOR_RED,
  COLOR_ORANGE,
  COLOR_YELLOW,
  COLOR_GREEN,
  COLOR_CYAN,
  COLOR_BLUE,
  COLOR_PURPLE,
  COLOR_PINK,
];

// Helper function to get hex color from constant
export function getColorHex(constant: ColorConstant | null | undefined): string {
  if (!constant) return "";
  return COLOR_MAP[constant] || "";
}

// Helper function to get display color (for UI backgrounds)
export function getDisplayColor(constant: ColorConstant | null | undefined): string {
  const hex = getColorHex(constant);
  return hex || "#d1d5db";
}

export const COLLECTION_SURFACE_MAP: Record<ColorConstant, string> = {
  NONE: "var(--app-reading)",
  RED: "var(--app-rose)",
  ORANGE: "var(--app-peach)",
  YELLOW: "var(--app-butter)",
  GREEN: "var(--app-green)",
  CYAN: "var(--app-mint)",
  BLUE: "var(--app-sky)",
  PURPLE: "var(--app-lavender)",
  PINK: "var(--app-pink)",
};
