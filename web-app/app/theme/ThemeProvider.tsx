"use client";

import * as React from "react";
import { CssBaseline } from "@mui/material";

type Mode = "light" | "dark";

function getInitialMode(): Mode {
  if (typeof window === "undefined") return "light";
  return (localStorage.getItem("theme") as Mode) || "light";
}

export const ThemeContext = React.createContext<{
  mode: Mode;
  toggle: () => void;
}>({ mode: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<Mode>(getInitialMode);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    localStorage.setItem("theme", mode);
  }, [mode]);

  return (
    <ThemeContext.Provider
      value={{
        mode,
        toggle: () => setMode((m) => (m === "dark" ? "light" : "dark")),
      }}
    >
      <CssBaseline />
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  return React.useContext(ThemeContext);
}
