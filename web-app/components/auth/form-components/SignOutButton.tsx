"use client";

/**
 * Basic sign out button component that calls the sign out action on button press
 */

import { signOutAction } from "@/services/user/sign-in-actions";

export default function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="px-4 py-2 rounded-sm text-white bg-[var(--color-error)] hover:opacity-90 transition"
      >
        Sign Out
      </button>
    </form>
  );
}
