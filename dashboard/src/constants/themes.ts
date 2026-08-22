export type ThemeVariant = "sunset" | "retro" | "neon" | "aurora";

export interface ThemeVariantOption {
  value: ThemeVariant;
  label: string;
}

export const THEME_VARIANT_OPTIONS: ThemeVariantOption[] = [
  {
    value: "sunset",
    label: "Sunset",
  },
  {
    value: "retro",
    label: "Retro",
  },
  {
    value: "neon",
    label: "Neon",
  },
  {
    value: "aurora",
    label: "Aurora",
  },
];

export function isThemeVariant(value: unknown): value is ThemeVariant {
  return THEME_VARIANT_OPTIONS.some((option) => option.value === value);
}
