"use client";

import Link from "next/link";

export default function ForgotPasswordText() {
  return (
    <p className="text-xs text-[var(--color-text-secondary)] text-center">
      Do not have an account?{" "}
      <Link
        href="/auth/sign-up"
        className="text-[var(--color-primary)] hover:underline"
      >
        Click here to create one
      </Link>
      .
    </p>
  );
}
