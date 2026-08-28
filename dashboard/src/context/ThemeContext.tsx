import { createContext, useEffect, useState, type ReactNode } from "react";
import { isThemeVariant, type ThemeVariant } from "../constants/themes";
import { useUserInfo, useUpdateThemeVariant } from "../hooks/useUserInfoQuery";
import { useAuth } from "./useAuth";

interface ThemeContextType {
  themeVariant: ThemeVariant;
  themeSaveError: string | null;
  setThemeVariant: (variant: ThemeVariant) => void;
  retryThemeSave: () => void;
  dismissThemeSaveError: () => void;
}

function persistThemeVariant(variant: ThemeVariant): void {
  try {
    localStorage.setItem("themeVariant", variant);
  } catch {
    // A local preference must not block the app or cloud authorization errors.
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext<ThemeContextType | undefined>(
  undefined,
);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: userInfo } = useUserInfo();
  const updateThemeVariant = useUpdateThemeVariant();
  const [themeVariant, setThemeVariantState] = useState<ThemeVariant>(() => {
    try {
      const saved = localStorage.getItem("themeVariant");
      if (saved === "current") return "sunset";
      return isThemeVariant(saved) ? saved : "sunset";
    } catch {
      return "sunset";
    }
  });
  const [failedThemeVariant, setFailedThemeVariant] =
    useState<ThemeVariant | null>(null);
  const [themeSaveError, setThemeSaveError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.themeVariant = themeVariant;
  }, [themeVariant]);

  useEffect(() => {
    if (!isThemeVariant(userInfo?.theme_variant)) return;

    setThemeVariantState(userInfo.theme_variant);
    persistThemeVariant(userInfo.theme_variant);
  }, [userInfo?.theme_variant]);

  const saveThemeVariant = (variant: ThemeVariant) => {
    if (!user) return;
    setThemeSaveError(null);
    updateThemeVariant.mutate(variant, {
        onSuccess: () => {
          setFailedThemeVariant(null);
        },
        onError: (error) => {
          setFailedThemeVariant(variant);
          setThemeSaveError(
            error instanceof Error
              ? error.message
              : "Could not save your theme preference.",
          );
        },
      });
  };

  const setThemeVariant = (variant: ThemeVariant) => {
    setThemeVariantState(variant);
    persistThemeVariant(variant);
    saveThemeVariant(variant);
  };

  return (
    <ThemeContext.Provider
      value={{
        themeVariant,
        themeSaveError,
        setThemeVariant,
        retryThemeSave: () => {
          if (failedThemeVariant) saveThemeVariant(failedThemeVariant);
        },
        dismissThemeSaveError: () => setThemeSaveError(null),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
