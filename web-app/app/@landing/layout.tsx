// app/@landing/layout.tsx
import * as React from "react";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
