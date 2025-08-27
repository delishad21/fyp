"use client";

import { signOutAction } from "@/services/user/sign-in-actions";

export default function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="px-4 py-2 rounded-sm text-[--color-text-primary] bg-[var(--color-error)] hover:opacity-90 transition"
      >
        Sign Out
      </button>
    </form>
  );
}
