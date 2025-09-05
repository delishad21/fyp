"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { ToastProvider } from "@/components/ui/toast/ToastProvider";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <NextThemesProvider
        attribute="data-theme" // sets <html data-theme="light|dark">
        defaultTheme="system"
        enableSystem
        storageKey="theme"
        disableTransitionOnChange
      >
        <ToastProvider>{children}</ToastProvider>
      </NextThemesProvider>
    </QueryClientProvider>
  );
}
