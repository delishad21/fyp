import type { ReactNode } from "react";
import "@/app/globals.css";
import { AppProviders } from "@/app/providers";

export const metadata = { title: "<App Name>" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
