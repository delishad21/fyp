"use client";

import * as React from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { ThemeProvider as MuiThemeProvider, CssBaseline } from "@mui/material";
import { getMuiTheme } from "@/app/theme/muiTheme";

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

  // Use your existing theme factory (no changes)
  const theme = React.useMemo(() => getMuiTheme(mode), [mode]);

  return (
    <ThemeContext.Provider
      value={{
        mode,
        toggle: () => setMode((m) => (m === "dark" ? "light" : "dark")),
      }}
    >
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  return React.useContext(ThemeContext);
}
