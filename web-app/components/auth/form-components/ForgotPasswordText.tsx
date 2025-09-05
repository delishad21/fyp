"use client";

/**
 * Basic text component to link user to forgot password page
 */

import Link from "next/link";

export default function ForgotPasswordText() {
  return (
    <p className="text-xs text-[var(--color-text-secondary)] text-center">
      Forgot your password?{" "}
      <Link
        href="/auth/forget-password"
        className="text-[var(--color-primary)] hover:underline"
      >
        Click here to recover your account
      </Link>
      .
    </p>
  );
}
