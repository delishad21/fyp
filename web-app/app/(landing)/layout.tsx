import { getSession } from "@/services/user/session-definitions";
import { redirect } from "next/navigation";
import * as React from "react";

export default async function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (session.isLoggedIn) {
    // user is logged in, redirect to dashboard
    redirect("/home");
  }

  return (
    <div className="relative min-h-dvh">
      <div
        className="
          pointer-events-none fixed inset-0 z-0
          [background:linear-gradient(135deg,var(--color-bg1)_0%,var(--color-bg1)_50%,var(--color-primary-dark)_50%,var(--color-primary-light)_100%)]
        "
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
