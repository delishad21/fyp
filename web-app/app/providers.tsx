"use client";

import * as React from "react";
import { ThemeProvider as MuiThemeProvider, CssBaseline } from "@mui/material";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { getMuiTheme } from "@/app/theme/muiTheme";
import { ToastProvider } from "@/components/ui/toast/ToastProvider";

function MuiAdapter({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme(); // "light" | "dark" | undefined
  const mode = (resolvedTheme as "light" | "dark") ?? "light";
  const theme = React.useMemo(() => getMuiTheme(mode), [mode]);

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme" // sets <html data-theme="light|dark">
      defaultTheme="system"
      enableSystem
      storageKey="theme"
      disableTransitionOnChange
    >
      <MuiAdapter>
        <ToastProvider>{children}</ToastProvider>
      </MuiAdapter>
    </NextThemesProvider>
  );
}
