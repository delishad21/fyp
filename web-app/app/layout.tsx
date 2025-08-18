import type { ReactNode } from "react";
import "@/app/globals.css";
import { AppProviders } from "@/app/providers";

export const metadata = {
  title: "<App Name>",
};

export default function RootLayout({
  landing,
  app,
}: {
  landing: ReactNode;
  app: ReactNode;
}) {
  // eventually replace with real auth check (cookies, session, etc.)
  const isSignedIn = false;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh">
        <AppProviders>{isSignedIn ? app : landing}</AppProviders>
      </body>
    </html>
  );
}
