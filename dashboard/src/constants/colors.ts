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

// Warm, slightly softened collection colors tuned to the app theme.
export const COLOR_MAP: Record<ColorConstant, string> = {
  [COLOR_NONE]: "var(--app-line)",
  [COLOR_RED]: "#d95763",
  [COLOR_ORANGE]: "#e8833a",
  [COLOR_YELLOW]: "#d6a832",
  [COLOR_GREEN]: "#45a56b",
  [COLOR_CYAN]: "#2fa9a1",
  [COLOR_BLUE]: "#4f86c6",
  [COLOR_PURPLE]: "#8b6bc8",
  [COLOR_PINK]: "#d46aa0",
};

export const COLLECTION_BADGE_COLOR_MAP = {
  [COLOR_NONE]: "zinc",
  [COLOR_RED]: "red",
  [COLOR_ORANGE]: "orange",
  [COLOR_YELLOW]: "yellow",
  [COLOR_GREEN]: "green",
  [COLOR_CYAN]: "cyan",
  [COLOR_BLUE]: "blue",
  [COLOR_PURPLE]: "purple",
  [COLOR_PINK]: "pink",
} as const;

export function getCollectionBadgeColor(
  color: ColorConstant | null | undefined,
): (typeof COLLECTION_BADGE_COLOR_MAP)[ColorConstant] {
  return color ? (COLLECTION_BADGE_COLOR_MAP[color] ?? "zinc") : "zinc";
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
