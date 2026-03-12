import React, { createContext, useContext, useMemo, useState } from "react";
import { Appearance, ColorSchemeName } from "react-native";
import { dark, light, type Colors } from "./colors";
import { darkTokens, lightTokens, type ThemeTokens } from "./tokens";

type Theme = {
  scheme: "light" | "dark";
  colors: Colors;
  tokens: ThemeTokens;
  setScheme: (s: "light" | "dark") => void;
};
const ThemeCtx = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const sys = (Appearance.getColorScheme() as ColorSchemeName) ?? "light";
  const [scheme, setScheme] = useState<"light" | "dark">(
    sys === "dark" ? "dark" : "light"
  );
  const value = useMemo(
    () => ({
      scheme,
      colors: scheme === "dark" ? dark : light,
      tokens: scheme === "dark" ? darkTokens : lightTokens,
      setScheme,
    }),
    [scheme]
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
